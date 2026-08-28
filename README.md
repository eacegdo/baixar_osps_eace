# Extração OSP

Puxa os dados do Bubble e gera as planilhas de OSP — as mesmas colunas da
"Extração completa OSP", já formatadas em português (datas `dd/mm/aaaa`,
valores `2.286,40`), separadas por fornecedor.

Funciona de dois jeitos: **comando no terminal** (mais simples) ou **API HTTP**
(pra outro sistema chamar).

---

## 1. Instalar (uma vez só)

Precisa do [Node.js](https://nodejs.org) 22 ou mais novo.

```bash
npm install
```

Depois crie o arquivo `.env` na pasta do projeto:

```bash
cp .env.example .env
```

E preencha:

| Variável | O que é | Onde achar |
| --- | --- | --- |
| `BUBBLE_BASE_URL` | Endereço da API do Bubble | `https://eace.org.br/api/1.1/obj` |
| `BUBBLE_TOKEN` | Senha de acesso à API | No editor do Bubble: **Settings → API → API Tokens** |
| `CACHE_TTL` | Validade da cópia local, em segundos | `900` (15 min) — veja [Cache](#cache) |
| `API_KEY` | Senha da sua API | Veja [Chave da API](#chave-da-api) |
| `PORT` | Porta da API | `8080` |

> O `.env` tem senha dentro. Ele já está no `.gitignore` — não suba pro Git.

---

## 2. Gerar a planilha (terminal)

```bash
npm run extracao -- --zip
```

Pronto. Isso cria:

- pasta `extracao_osp/` com um CSV por fornecedor (fatiado em partes)
- arquivo `extracao_osp.zip` com tudo junto

Demora ~1min30 na primeira vez do dia, ~5s nas seguintes (veja [Cache](#cache)).

### Variações

| Quero… | Comando |
| --- | --- |
| Um CSV único, tudo junto | `npm run extracao -- --unico` |
| Abrir no Excel brasileiro | `npm run extracao -- --zip --sep ';'` |
| Só um fornecedor | `npm run extracao -- --fornecedor BRISANET` |
| Fornecedor pelo unique id | `npm run extracao -- --fornecedor-id 1774638667943x152870812523466340` |
| OSP pelo unique id | `npm run extracao -- --osp-id 1762525512670x975509644092375000` |
| Só um status | `npm run extracao -- --status Concluído` |
| Só uma OSP | `npm run extracao -- --osp 254` |
| Partes maiores (2000 linhas) | `npm run extracao -- --zip --linhas 2000` |
| Salvar em outra pasta | `npm run extracao -- --out relatorio_agosto` |
| **Dado atualizado** (renova o cache) | `npm run extracao -- --zip --atualizar` |
| Dado avulso, sem tocar no cache | `npm run extracao -- --zip --sem-cache` |

> O `--` depois de `npm run extracao` é obrigatório. É ele que diz "o resto é
> pro programa, não pro npm".

---

## 3. Usar como API

Liga o servidor:

```bash
npm start
```

Ele fica escutando em `http://localhost:8080`. Deixe essa janela do terminal
aberta; pra desligar, `Ctrl+C`.

### Documentação navegável

Abra **http://localhost:8080/docs** no navegador. Todas as rotas estão lá, com
os filtros explicados e um botão **Try it out** pra testar sem precisar de curl.

### Endpoints

| Endereço | O que devolve |
| --- | --- |
| `GET /extracao` | A extração completa (csv, zip ou json) |
| `GET /health` | Só pra saber se está no ar |

### Exemplos

```bash
# extração completa em CSV
curl -O -J "http://localhost:8080/extracao"

# em zip, um arquivo por fornecedor
curl -O -J "http://localhost:8080/extracao?formato=zip"

# separador do Excel brasileiro
curl "http://localhost:8080/extracao?sep=%3B" -o extracao_osp.csv

# filtrando
curl "http://localhost:8080/extracao?fornecedor=BRISANET" -o brisanet.csv
curl "http://localhost:8080/extracao?osp=254&formato=json"

# acento no filtro: use --data-urlencode, senão o curl manda errado e dá 400
curl -G "http://localhost:8080/extracao" --data-urlencode 'status=Concluído' -o concluidas.csv

# dado atualizado (baixa do Bubble e renova o cache pra quem vier depois)
curl "http://localhost:8080/extracao?formato=zip&atualizar=true" -o extracao_osp.zip
```

Toda chamada precisa levar a chave no header — veja [Chave da API](#chave-da-api):

```bash
curl -H "X-API-Key: SUA_CHAVE" "http://localhost:8080/extracao?formato=zip" -o extracao.zip
```

### Parâmetros de `/extracao`

| Parâmetro | Exemplo | O que faz |
| --- | --- | --- |
| `formato` | `?formato=zip` | `csv` (padrão), `zip` ou `json` |
| `fornecedor` | `?fornecedor=BRISANET` | Nome do fornecedor (aceita o id também) |
| `fornecedor_id` | `?fornecedor_id=1774638667943x152870812523466340` | Unique id do fornecedor no Bubble |
| `osp` | `?osp=254` | Número da OSP (aceita o id também) |
| `osp_id` | `?osp_id=1762525512670x975509644092375000` | Unique id da OSP no Bubble |
| `status` | `?status=Concluído` | Só um status de OSP |
| `sep` | `?sep=%3B` | Troca a vírgula por `;` (Excel brasileiro) |
| `bom` | `?bom=false` | Tira o BOM do CSV |
| `linhas` | `?linhas=2000` | Tamanho de cada arquivo no zip (padrão 1500) |
| `atualizar` | `?atualizar=true` | Busca dado fresco no Bubble e **renova** o cache — é o "atualizar" da tela |
| `ttl` | `?ttl=0` | `0` busca dado fresco **sem** renovar o cache (uso avulso) |

#### Todos, ou um só

Todo filtro aceita `*` (ou vazio) com o sentido de "todos". Assim o programa que
chama a API pode montar a URL sempre igual, trocando só o valor:

```bash
curl "http://localhost:8080/extracao?fornecedor=*"       # todos os fornecedores
curl "http://localhost:8080/extracao?fornecedor=BRISANET" # só um
```

#### Filtrar por unique id

Quando quem chama já tem o id do Bubble em mãos, use `fornecedor_id` e
`osp_id`. É mais firme que o nome — o nome tem acento, espaço, e alguém pode
editar no Bubble:

```bash
# pelo nome — precisa de --data-urlencode por causa do espaço
curl -G "http://localhost:8080/extracao" \
  --data-urlencode 'fornecedor=STEIN TELECOM LTDA (filial PA)'

# pelo id — cola direto na URL, sem encode
curl "http://localhost:8080/extracao?fornecedor_id=1774638667943x152870812523466340"
```

Os dois devolvem as mesmas 3.820 linhas. Um id que não existe devolve 0 linhas
(não dá erro).

Pra descobrir os ids, peça a extração em json — cada linha traz
`_fornecedorId` e `_ospId`:

```bash
curl "http://localhost:8080/extracao?formato=json&osp=254"
```

Filtros se somam:

```bash
curl -G "http://localhost:8080/extracao" \
  --data-urlencode 'fornecedor_id=1774638667943x152870812523466340' \
  --data-urlencode 'status=Concluído'      # 292 linhas
```

## 4. Rodar com Docker

Se preferir não instalar Node na máquina. Precisa do `.env` preenchido (passo 1).

```bash
docker compose up -d --build
```

Pronto: API em http://localhost:8080, docs em http://localhost:8080/docs.

| Quero… | Comando |
| --- | --- |
| Ver os logs | `docker compose logs -f` |
| Parar | `docker compose down` |
| Subir em outra porta | `PORT=8091 docker compose up -d` |
| Rodar a extração pelo terminal do container | `docker compose exec api node src/extracao.js --zip` |
| Copiar o zip gerado pra sua máquina | `docker compose cp api:/app/extracao_osp.zip .` |

A cópia local das tabelas (o cache) fica num volume chamado `cache`, então ela
sobrevive a `down` e `up`. Pra zerar: `docker compose down -v`.

O container tem healthcheck: `docker compose ps` mostra `healthy` quando a API
respondeu em `/health`.

### Sem compose

```bash
docker build -t extracao-osp .
docker run -d -p 8080:8080 --env-file .env extracao-osp
```

---

## Chave da API

A API é protegida por uma chave no header `X-API-Key`. Ela fica no `.env`:

```
API_KEY=sua_chave_aqui
```

Toda chamada precisa mandar a chave:

```bash
curl -H "X-API-Key: sua_chave_aqui" "http://localhost:8080/extracao?formato=zip" -o extracao.zip
```

Também aceita o formato `Authorization: Bearer sua_chave_aqui`, se o sistema que
chama já usar esse padrão.

Sem a chave, ou com a chave errada, a resposta é:

```json
{ "error": "chave de API ausente ou inválida" }
```

Duas rotas ficam abertas de propósito: `/health` (é ela que o Docker consulta
pra saber se a API está de pé) e `/docs` (a página precisa abrir pra você
clicar em **Authorize** e colar a chave; as chamadas de dentro dela já vão
autenticadas).

**Gerar uma chave nova:**

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Cole o resultado em `API_KEY=` no `.env` e reinicie a API. Quem usava a chave
antiga para de funcionar na hora — é assim que se revoga o acesso de alguém.

**Se deixar `API_KEY` vazio**, a API fica aberta pra qualquer um que alcance a
porta. Só faça isso rodando local, na sua máquina.

---

## Cache

Pra montar a planilha o programa precisa buscar ~165 mil registros no Bubble —
tipo copiar cinco fichários inteiros. Leva ~1min30.

Pra não repetir isso toda hora, ele guarda uma cópia local na pasta `.cache`.
Nas execuções seguintes lê a cópia, em vez de buscar tudo de novo.

A API tem ainda uma segunda camada: as linhas já montadas ficam na memória do
processo pela mesma validade, então requisições seguidas nem releem o disco.

| Situação | O que acontece | Tempo |
| --- | --- | --- |
| Primeira vez do dia | Busca tudo no Bubble | ~1min30 |
| Rodou de novo em até 15 min | Lê a cópia local | ~0,9s |
| Requisição seguinte na API | Usa a memória | ~0,08s |
| Rodou depois de 15 min | Busca tudo de novo | ~1min30 |

Essa cópia vale **15 minutos**. Depois disso ela é descartada e o programa
busca tudo de novo no Bubble.

**Atenção:** se alguém mexeu no Bubble agora, a cópia pode estar até 15 minutos
atrasada. Pra número oficial (fechamento, conferência), peça dado fresco.

### Pedir dado fresco: `atualizar` ou `ttl=0`

São coisas diferentes:

| | Lê o cache | Busca no Bubble | Regrava o cache |
| --- | --- | --- | --- |
| `/extracao` (padrão) | sim, se ainda vale | só se vencido | sim |
| `?atualizar=true` | **não** | **sempre** | **sim** |
| `?ttl=0` | não | sempre | **não** |

Use **`atualizar=true`** — é o botão "atualizar" da tela. Ele paga o ~1min30 uma
vez e deixa a cópia nova no lugar, então quem pedir logo depois já pega rápido.

`ttl=0` (e o `--sem-cache` do terminal) busca fresco mas joga fora: a próxima
chamada vai baixar tudo de novo. Serve pra um dado avulso que não deve virar a
cópia oficial, ou pra depurar.

### Quanto botar em `CACHE_TTL`

O valor é **em segundos** — quanto tempo a cópia vale antes de buscar tudo de
novo no Bubble.

| Valor | Significa | Quando usar |
| --- | --- | --- |
| `0` | sem cache, sempre busca no Bubble | quase nunca — deixa tudo lento |
| `900` | 15 minutos — **padrão, recomendado** | uso normal |
| `3600` | 1 hora | você vai gerar vários recortes seguidos |
| `86400` | 1 dia | dado do dia anterior já serve |

Na prática: deixe `900` e esqueça. Quando precisar do dado do minuto, não mexa
no arquivo — peça na hora, com `?atualizar=true`.

Pra apagar a cópia: `rm -rf .cache` — ela se refaz sozinha depois. Os arquivos
lá dentro são JSON cru do Bubble, numa linha só; é normal estarem ilegíveis.

---

## De onde vem cada coluna

A planilha junta cinco tabelas do Bubble. Cada linha é **um item de uma OSP**.

| Coluna | Vem de |
| --- | --- |
| Projeto, Fase, Status escola, Data conexão escola teste | `Escolas` |
| Fornecedor, Cod Fornecedor, CNPJ | `fornecedor` |
| Num OSP, Num provisorio, Status OSP, Previsão de execução | `OSP` |
| Descrição Item, Qnt Produto, Valor unite ur, Valor Produto, Prod serv | `contrato_taxa_instalacao` |
| Num NF, Valor da NF, Status NF Sisop, datas de SAP/nota, títulos de arquivo, Motivo da reprovação, ID Sisop | `FR_OSP` |

Duas regras que não são cópia direta de campo:

- **Validação OSP**: `Aprovado` quando a OSP já tem número definitivo,
  `Provisório` enquanto só tem número provisório.
- **Valor da NF**: usa `Valor da nota`; quando ele está vazio (notas antigas),
  cai pra `Valor total`.

---

## Problemas comuns

**`EADDRINUSE: address already in use 0.0.0.0:8080`**
Já tem um servidor rodando nessa porta. Ou você fecha o antigo, ou usa outra:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN   # mostra quem está usando
PORT=8081 npm start                # ou sobe em outra porta
```

**`BUBBLE_BASE_URL e BUBBLE_TOKEN são obrigatórios`**
Falta o `.env`, ou ele está incompleto. Veja o passo 1.

**`{"error":"chave de API ausente ou inválida"}`**
Faltou o header `X-API-Key`, ou ele não bate com o `API_KEY` do `.env`.

**`bubble returned 401` / `403`**
Token errado ou vencido. Gere outro em Settings → API no editor do Bubble.

**`bubble returned 404: Missing object of type X`**
O nome da tabela está errado, ou ela não está liberada na API. No editor:
**Settings → API**, marque a caixinha do data type.

**Excel abriu tudo embolado numa coluna só**
Gere com `;`: `npm run extracao -- --zip --sep ';'`.

---

## Estrutura do projeto

```
src/
  extracao.js        comando do terminal
  server.js          API HTTP
  extracao-core.js   regra da extração: junta as tabelas e monta as linhas
  bubble.js          conversa com a API do Bubble (paginação)
  formato.js         datas e valores em português
  csv.js             escrita de CSV
  cache.js           cópia local das tabelas
  pool.js            limita quantas buscas rodam ao mesmo tempo
  zip.js             empacota os CSVs
  client.js          cria o cliente do Bubble com as credenciais do .env
Dockerfile           imagem da API
docker-compose.yml   sobe a API com o cache em volume
```

Documentação da API também em http://localhost:8080/docs com o servidor no ar.
