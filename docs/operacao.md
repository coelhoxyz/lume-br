# Operação e fontes

## Serviços

- `lume-web`: Astro, leitura do D1 e endpoint de fotos do R2.
- `lume-collector`: Cron às 06:00 UTC e consumidor da fila `lume-ingest`.
- `lume-db`: catálogo, versões, registros e estado dos jobs.
- `lume-source-data`: bucket privado, originais e retratos.
- `lume-ingest-dlq`: mensagens que esgotaram as tentativas.

O coletor requer Workers Paid por seu orçamento de CPU. Criar recursos não altera o plano automaticamente. Falhas de fonte mantêm os dados anteriores. Verifique datas dos datasets e jobs; um `/health` 200 do coletor prova que o Worker atende, não que a última coleta terminou.

## Fontes primárias

- [Cadastro em exercício](https://www.camara.leg.br/SitCamaraWS/Deputados.asmx/ObterDeputados).
- [Documentação dos arquivos públicos](https://dadosabertos.camara.leg.br/swagger/api.html?tab=staticfile).
- CEAP: `https://www.camara.leg.br/cotas/Ano-<ano>.csv.zip`.
- Legislação: `https://dadosabertos.camara.leg.br/arquivos/<conjunto>/csv/<conjunto>-<ano>.csv` para `votacoes`, `votacoesVotos`, `votacoesProposicoes`, `proposicoes` e `proposicoesAutores`.

O join de parlamentar usa `ideCadastro`/`deputado_id`/`idDeputadoAutor`. O join de voto usa `idVotacao`. `votacoesProposicoes` indica proposições afetadas; não identifica sozinho o objeto exato submetido a voto. O arquivo anual pode conter proposições antigas reautuadas: filtre `dataApresentacao`.

Despesas usam `vlrLiquido`, `numAno` e `numMes`; `datEmissao` é outra informação. A identidade da linha CEAP inclui seu ordinal no snapshot para não descartar lançamentos iguais legítimos. A publicação usa uma nova versão, portanto o ordinal não é chave histórica entre arquivos diferentes.

## Carga inicial de outubro de 2026

`scripts/prepare-import.ts` reproduz o bootstrap da carga de 2026 a partir de arquivos oficiais já baixados e seus metadados. Os dados e arquivos SQL ficam em `data-import/`, ignorado pelo Git. O script verifica hashes antes de gerar comandos, não baixa conteúdo silenciosamente.

Entradas: XML `legacy-deputies-http.sample`, `deputies-sp.json` com `fetchedAt` e `spRecords`, `Ano-2026.csv.zip`, `cota-2026-metadata.json`, cinco CSVs legislativos e `vote-datasets-metadata.json` com URL/hash de cada arquivo. Consulte o script para o contrato. A coleta contínua não depende deste bootstrap datado.

```sh
node --experimental-strip-types scripts/prepare-import.ts <pasta-das-fontes> data-import
npx wrangler d1 execute lume-db --local --file data-import/import.sql
```

Em conta autenticada, `scripts/import-d1.py --file ... --account ... --database ...` importa por consultas limitadas; `scripts/upload-sources.py --manifest ... --portraits ... --account ... --bucket ...` arquiva arquivos e retratos. Ambos aceitam `CLOUDFLARE_API_TOKEN` ou usam a sessão OAuth do Wrangler em memória; não registram a credencial. Confira os destinos antes de executar.

## Verificação

```sh
npm run check
npm test
npm run build
PLAYWRIGHT_CHROME=1 npm run test:e2e
npx wrangler d1 execute lume-db --remote --command "SELECT scope, count, fetched_at FROM datasets ORDER BY scope"
```

`/api/health` do site informa versão, commit e resumos da cobertura. Após deploy, compare o commit, confira home e um perfil, um retrato e ao menos um total financeiro contra o arquivo fonte. Consulte `ingestion_jobs` e a fila de falhas após rodar o coletor. Registros antigos são removidos do D1 somente após publicar uma versão válida; os arquivos brutos no R2 permanecem.

## Pendências explícitas

- **Emendas:** chave CGU via Gov.br e mapeamento validado dos autores. Não há ingestão ou dado de emendas nesta versão. A chave deverá ser secret do coletor, nunca variável pública ou arquivo versionado.
- **Retratos:** a primeira carga cobre os 70 IDs atuais. O coletor ainda não renova as fotos. IDs novos mostram um placeholder até a carga do retrato oficial.
- **Alertas:** jobs e fila de falhas existem; notificações externas ainda não estão configuradas.
- **Escala:** limites por banco D1 e orçamento por job são barreiras explícitas. O coletor falha preservando o snapshot quando o volume excede o orçamento.
- **Retenção R2:** originais são conservados. Estabeleça política de retenção por necessidade de auditoria e custo ao ampliar o acervo.
