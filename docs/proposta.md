# Direção do Lume

Lume, de *lumen*: tornar a vida pública mais fácil de acompanhar. A visão é um changelog cidadão, com registros verificáveis e linguagem clara.

## Primeiro recorte

Deputados federais em exercício por São Paulo: identidade, partido, votos, despesas da cota e proposições. Emendas exigem integração própria com o Portal da Transparência, incluindo a associação validada entre o código de autor SIAFI e o ID da Câmara.

A interface começa pelas pessoas. Fotos, hierarquia visual simples, busca e períodos ajudam a explorar o mandato; fontes, data de coleta e cobertura tornam os números verificáveis. Valores indisponíveis não são zero. Votos individuais não são o resultado coletivo nem um registro de presença.

## Tecnologia atual

Astro e TypeScript no Cloudflare Workers; D1 para os registros consultados; R2 privado para arquivos originais; Queues e Cron para coleta. Cache de HTML e fotos reduz leituras e chamadas repetidas. Fontes e assets estáticos são servidos localmente.

Para o MVP, o coletor lê arquivos públicos anuais em fluxo, guarda os originais e publica versões completas. Uma falha conserva a última versão válida. A leitura do site não depende da disponibilidade instantânea dos serviços governamentais.

D1 tem capacidade finita por banco. A expansão nacional exige medir volume, índices, concorrência e custo antes de escolher particionamento ou outro armazenamento. R2 guarda o acervo bruto; ele não substitui um índice de busca.

## Evolução

1. Integrar emendas e validar os vínculos de autoria por exercício.
2. Automatizar renovação de retratos e ampliar observabilidade da coleta.
3. Introduzir histórico de mandatos e filiação, Alesp e Senado como recortes próprios.
4. Incorporar atos do Diário Oficial e busca de documentos.
5. Avaliar Jev para extração e classificação com esquema validado e vínculo ao documento original.

Go pode ser útil para processamentos futuros em containers, mas não é necessário para o coletor atual. Resumos com IA devem permanecer distinguíveis da fonte oficial; nenhum texto gerado deve substituir o registro de origem.
