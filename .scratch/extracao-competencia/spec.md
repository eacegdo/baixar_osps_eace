# Extração por Competência Mensal e Escolas Conectadas

Status: ready-for-agent

## Problem Statement

A extração de OSP atual realiza um *dump completo* de 5 tabelas brutas do Bubble (`FR_OSP`, `contrato_taxa_instalacao`, `OSP`, `Escolas`, `fornecedor`), baixando ~165.000 registros através de ~1.650 requisições HTTP a cada ciclo de atualização. Isso consome centenas de *Workload Units (WUs)* do plano Bubble, leva cerca de 1min30s e gera riscos de rate-limit e timeout.

Além disso, a operação financeira/contratual precisa acompanhar o faturamento por **competência mensal**:
1. O foco do fechamento são as **folhas (`FR_OSP`) do mês atual**.
2. Quando uma escola é conectada no mês atual, suas folhas (mesmo as criadas em meses anteriores ou no mês atual) devem entrar na extração.
3. Para essas escolas conectadas no mês, a coluna **"Previsão de execução"** deve exibir a data de conexão informada no relatório de importação (**`data_relatorio`** da tabela `importação_escola`), em vez da data prevista original da OSP.

Atualmente, não existe filtro na origem (Bubble Data API), e a coluna `Previsão de execução` só olha para `item['Previsão de execução'] ?? osp['Previsão de entrega']`.

## Solution

1. Introduzir uma extração filtrada por mês (`--mes atual` ou `--mes YYYY-MM`), onde as consultas ao Bubble aplicam `constraints` diretamente na origem:
   - Consulta na tabela **`importação_escola`** com `data_relatorio` dentro do mês selecionado.
   - Agrupamento por escola (`inep`) e filtragem das escolas cujo `Status Geral` seja `Conectada`.
   - Consulta das **`FR_OSP`** criadas no mês de referência + `FR_OSP` vinculadas aos INEPs/IDs das escolas conectadas no mês.
   - Resolução pontual dos itens de contrato (`contrato_taxa_instalacao`), OSPs e fornecedores associados a essas FRs.
2. Na geração das linhas do relatório, a coluna **"Previsão de execução"** prioriza a **`data_relatorio`** (formatada como `dd/mm/aaaa`) para qualquer escola que tenha sido conectada no mês de referência.
3. Manter a extração completa acessível para quando for necessário um dump histórico integral (`--completo`).

## User Stories

1. Como analista de faturamento, quero rodar a extração do mês corrente em poucos segundos, para agilizar a conferência de medição sem esperar o download de 100 mil registros.
2. Como analista de faturamento, quero que a extração traga as folhas geradas no mês atual.
3. Como gestor de implantação, quero que qualquer escola conectada no mês atual que possua folha anterior seja incluída no relatório, para não deixar medições de escolas recém-ativadas de fora.
4. Como conferente, quero que para as escolas conectadas no mês a coluna `Previsão de execução` mostre a `data_relatorio` da conexão (formato `dd/mm/aaaa`), para refletir a data real da ativação informada no relatório.
5. Como conferente, quero que escolas não conectadas no mês mantenham o comportamento padrão da data de previsão (`item['Previsão de execução'] ?? osp['Previsão de entrega']`).
6. Como integrador (via n8n ou cron), quero poder chamar `GET /extracao?mes=atual&formato=zip` e receber o relatório pronto em ~3 segundos, sem estourar tempo limite de execução.
7. Como desenvolvedor, quero que as chamadas ao Bubble sejam feitas com `constraints` na API Data para reduzir as requisições de ~1.650 para ~25.
8. Como desenvolvedor, quero que o comportamento esteja 100% coberto por testes unitários com mocks de dados.

## Implementation Decisions

- **Tabela de Conexão no Bubble:**
  A tabela oficial é `importação_escola` (com cedilha e til, codificada na URL).
  Os campos consultados são:
  - `data_relatorio`: data/hora do registro no relatório mensal.
  - `inep`: código INEP da escola (texto).

- **Critério de Escola Conectada no Mês:**
  Uma escola é considerada conectada no mês de referência se:
  1. Possui registro em `importação_escola` com `data_relatorio >= inicioDoMes` e `data_relatorio < proximoMes`.
  2. Seu `Status Geral` na tabela `Escolas` é exatamente `Conectada`.
  Se houver múltiplos registros para o mesmo INEP no mês, adota-se a `data_relatorio` mais recente.

- **Regra da coluna `Previsão de execução`:**
  - Se a escola da linha (pelo INEP ou ID) constar na lista de escolas conectadas no mês:
    `formato(dataRelatorioDaEscola)` (`dd/mm/aaaa`).
  - Caso contrário:
    `item?.['Previsão de execução'] ?? osp['Previsão de entrega']` (com fallback e formatação existente).

- **Estratégia de Busca Reduzida (Redução de 98% das chamadas):**
  1. `importação_escola`: `constraints=[{"key":"data_relatorio","constraint_type":"greater than","value":inicio},{"key":"data_relatorio","constraint_type":"less than","value":fim}]`.
  2. `FR_OSP`:
     - FRs do mês: `constraints=[{"key":"Created Date","constraint_type":"greater than","value":inicio},{"key":"Created Date","constraint_type":"less than","value":fim}]`.
     - FRs das escolas conectadas: buscar por ID da escola para as escolas conectadas identificadas no passo 1.
  3. `contrato_taxa_instalacao` e `OSP`: apenas para os IDs referenciados pelas FRs filtradas.

- **Interface:**
  - **CLI:** `npm run extracao -- --mes atual` (ou `--mes 2026-09`). Se `--completo` for passado, roda o fluxo legado de dump total.
  - **API:** `GET /extracao?mes=atual` ou `GET /extracao?mes=2026-09`.

- **Módulos Alterados:**
  - `src/extracao-core.js`: inclusão da função `carregarDadosMes` e ajuste na função de resolução de `Previsão de execução`.
  - `src/extracao.js`: parsing do argumento `--mes` e `--completo`.
  - `src/app.js`: schema do Swagger e query param `mes`.
  - `src/extracao-core.test.js`: testes unitários da nova lógica.
  - `README.md`: documentação da regra de negócio e novos parâmetros.
