# Valor da NF na extração OSP

Status: ready-for-agent

## Problem Statement

Quem confere o relatório de novos casos identificados encontra linhas com
`Valor da NF` em `0,00` enquanto o SISOP, para a mesma nota, mostra o valor
cheio. Como o relatório é o que circula fora do portal — conferência de
faturamento, cobrança de fornecedor, fechamento de fase —, um valor zerado
manda o time voltar ao SISOP nota a nota pra descobrir qual dos dois números
vale. Pior: um `0,00` não parece erro, parece nota sem valor, e passa batido.

Casos reportados (todos ACS STEIN):

| INEP | OSP | Num NF | Relatório | SISOP |
| --- | --- | --- | --- | --- |
| 15572757 | 184 | 4022 | 0,00 | 14.579,25 |
| 29013534 | 222 | 3125 | 0,00 | 2.326,94 |
| 29397294 | 222 | 3263 | 0,00 | 25.861,49 |
| 15565181 | 241 | 4637 | 0,00 | 11.822,83 |
| 29203350 | 322 | 3079 | 0,00 | 23.785,46 |

## Solution

`Valor da NF` passa a ler a mesma fonte que a tela do SISOP lê: o `Valor Total`
do item de `contrato_taxa_instalacao`, e não mais os campos de valor da própria
`FR_OSP`. O relatório e o portal passam a mostrar o mesmo número, sem conferência
manual.

## User Stories

1. Como analista de faturamento, quero que o `Valor da NF` do relatório bata com
   o que o SISOP mostra, para não precisar abrir o portal nota a nota.
2. Como analista de faturamento, quero que notas com valor cheio parem de sair
   como `0,00`, para não subestimar o total de um fornecedor no fechamento.
3. Como analista de faturamento, quero que a coluna venha formatada em pt-BR com
   separador de milhar (`14.579,25`), para ler valores altos sem contar dígito.
4. Como analista de faturamento, quero que `Valor da NF` e `Valor Produto`
   mostrem o mesmo número do item, para conferir uma linha contra a outra.
5. Como analista de faturamento, quero uma linha por item da FR com o valor
   daquele item, para conferir item a item numa OSP com vários equipamentos.
6. Como conferente de fornecedor, quero que uma NF com vários itens não repita o
   valor do primeiro item nas demais linhas, para não somar o mesmo valor duas vezes.
7. Como conferente de fornecedor, quero que um item legitimamente zerado continue
   aparecendo como `0,00`, para enxergar o problema em vez de um campo em branco.
8. Como conferente de fornecedor, quero que uma FR sem nenhum item traga a coluna
   vazia em vez de um número inventado, para saber que ali não há o que conferir.
9. Como gestor de contrato, quero que a regra da coluna esteja escrita no README,
   para explicar a origem do número sem abrir o código.
10. Como gestor de contrato, quero que a mudança valha para toda a extração —
    CSV único, ZIP por fornecedor e API —, para nenhuma saída ficar defasada.
11. Como pessoa de suporte, quero que o comportamento da coluna esteja coberto por
    teste, para uma mudança futura em outra coluna não reintroduzir o `0,00`.
12. Como pessoa de suporte, quero saber quais FRs têm valor zerado na origem,
    para acionar quem preenche o Bubble em vez de tratar como bug do relatório.
13. Como desenvolvedor, quero que a coluna leia uma única fonte, sem cadeia de
    fallback, para não ter que raciocinar sobre qual campo venceu numa linha.

## Implementation Decisions

- **Fonte da coluna.** `Valor da NF` sai de `contrato_taxa_instalacao['Valor Total']`
  do item da linha. Os campos `FR_OSP['Valor da nota']` e `FR_OSP['Valor total']`
  deixam de ser lidos pela extração.

  A decisão veio da expressão do próprio SISOP, conferida na tela de configuração
  do relatório: `Current row's FR_OSP's lista de contratos_instalação:first item's
  Valor Total:formatted as R$1.028,58`. Copiar a fonte do portal é o que garante
  paridade — qualquer regra própria volta a divergir na primeira nota atípica.

- **Sem fallback.** A expressão é única, sem `??` nem `||` encadeado. Um item com
  `Valor Total` zerado sai `0,00`; uma FR sem item sai vazia. Fallback foi
  descartado depois de medido: nenhuma combinação dos campos da `FR_OSP` reproduz
  o SISOP em 100% dos casos, e a cadeia só esconde de qual campo o número veio.

- **Granularidade.** O SISOP usa `first item` porque a tela dele mostra uma linha
  por FR. A extração já emite **uma linha por item**, então cada linha usa o
  `Valor Total` do seu próprio item. Repetir o valor do primeiro item nas demais
  linhas produziria soma inflada na conferência. Divergência consciente da
  expressão literal do portal, com o mesmo resultado para FR de item único —
  que é a esmagadora maioria.

- **Relação com `Valor Produto`.** As duas colunas passam a ter a mesma origem,
  mudando só o formato: `Valor Produto` usa `decimal()` (`14579,25`, sem milhar)
  e `Valor da NF` usa `moeda()` (`14.579,25`, com milhar). É exatamente o que o
  SISOP faz — as duas expressões dele apontam para o mesmo campo, com máscaras
  diferentes. A redundância é do modelo do relatório, não deste código.

- **Módulo alterado.** Só a montagem de linha do núcleo de extração
  (`gerarLinhas`). Nada muda em cache, cliente do Bubble, particionamento,
  geração de CSV/ZIP ou contrato da API. `COLUNAS` fica idêntica: mesma coluna,
  mesma posição, mesmo nome.

- **Formatação.** `moeda()` já trata `null`/`undefined`/`''`/não-numérico
  devolvendo string vazia. Nenhuma mudança nos helpers de formato.

- **Documentação.** O README lista a origem de cada coluna: `Valor da NF` migra
  da linha da `FR_OSP` para a de `contrato_taxa_instalacao`, e a regra descrita
  em "não é cópia direta de campo" passa a registrar a relação com
  `Valor Produto` e o motivo de os campos da `FR_OSP` serem ignorados.

- **Dados da origem.** Medido sobre o cache real (40.613 FRs, 40.613 linhas):
  111 linhas ficam `0,00` (item zerado no Bubble) e 767 ficam vazias (FR sem
  item). São problemas de preenchimento na origem, não da extração — o SISOP
  mostra o mesmo. Corrigir o Bubble é assunto separado.

## Testing Decisions

Um bom teste aqui descreve o que sai na planilha, não como o código chega lá:
monta as cinco tabelas cruas, roda a geração de linhas e afirma sobre o texto
final da célula — `'14.579,25'`, não `14579.25`. Nada de espiar função interna
ou ordem de leitura de campo.

- **Seam.** `gerarLinhas(dados)` — função pura, tabelas cruas na entrada, linhas
  formatadas na saída. É a seam mais alta disponível e já é a usada pelos testes
  existentes; nenhuma seam nova é criada. Todas as saídas (CSV, ZIP, API) passam
  por ela, então o teste nesse ponto cobre as três.

- **Prior art.** As suítes `gerarLinhas — FRs provisórias` e
  `filtrar — número definitivo ou provisório`, no mesmo arquivo de teste, já
  seguem esse formato: fixture `dadosBase()` recriada por teste, filtro por
  `ID Sisop`, asserção sobre a célula.

- **Casos cobertos.** Valor vem do item; campos de valor da `FR_OSP` são
  ignorados mesmo quando preenchidos com outro número; `Valor da NF` e
  `Valor Produto` mostram o mesmo número com máscaras diferentes; FR sem item
  deixa a coluna vazia.

- **Verificação fora do teste automatizado.** As cinco linhas reportadas foram
  conferidas contra o cache real antes de fechar, comparando com os valores que o
  SISOP exibe. Checagem pontual, não parte da suíte.

## Out of Scope

- Corrigir os dados no Bubble: as FRs com `Valor da nota` ou `Valor total`
  zerado seguem zeradas na origem. A extração deixou de depender desses campos,
  mas quem os consome direto continua vendo o mesmo problema.
- Os 111 itens com `Valor Total` zerado e as 767 FRs sem item. Aparecem como
  `0,00` e vazio, igual ao SISOP.
- Alinhar as outras colunas cujas expressões do SISOP divergem do código
  (`Projeto`, `Cod Fornecedor`/`Fornecedor`/`CNPJ`, `Num Obra`, `Fase` usam
  fallbacks que o portal não tem). Levantado durante a análise, decisão adiada.
- Mudar a granularidade do relatório para uma linha por FR, como a tela do SISOP.
- Regerar os CSVs já gravados em `extracao_osp/`.
- Remover a redundância entre `Valor da NF` e `Valor Produto` — é o modelo do
  relatório que pede as duas.

## Further Notes

O bug original não era a fonte errada, era o operador: a coluna usava
`Valor da nota ?? Valor total`, e `??` só cai no fallback com `null`/`undefined`.
Com `Valor da nota = 0` — o caso das cinco notas —, o zero passava como valor
válido. Trocar para `||` resolveria as cinco linhas, mas manteria a coluna presa
a campos que o SISOP nem lê; a expressão do portal mostrou que a fonte inteira
estava errada.

Levantamento que sustenta o abandono dos campos da `FR_OSP`, sobre as 40.613
FRs do cache, usando a soma dos itens como referência independente: `Valor total`
bate em 39.133 de 39.735 FRs com item, `Valor da nota` em 31.842. Nenhum dos dois
sozinho serve — 40 FRs têm `Valor total` zerado com `Valor da nota` correta,
5 têm o inverso, e 602 divergem entre si com a soma dos itens dando razão à
`Valor da nota`. Ler o item direto pula a escolha: é a fonte de onde os dois
campos deveriam ter sido derivados.
