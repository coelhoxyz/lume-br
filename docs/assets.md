# Assets e atribuição

## Retratos oficiais

Os retratos publicados são fornecidos pela Câmara dos Deputados, vinculados pelo ID de cadastro do parlamentar. O catálogo oficial informa a URL da foto. `scripts/fetch-portraits.py` valida origem, protocolo, tamanho, formato JPEG e hash antes da carga no R2 privado.

Fonte: [Câmara dos Deputados](https://www.camara.leg.br/deputados). Os metadados de cada retrato, incluindo origem, data da consulta e SHA-256, acompanham o arquivo arquivado no R2. O endpoint público `/foto/<id>.jpg` expõe apenas retratos, sem permitir acesso arbitrário aos originais do bucket.

A licença Apache-2.0 cobre o código do Lume, não atribui ao projeto a autoria ou titularidade dos dados e das fotografias da Câmara. A atribuição à fonte é preservada na interface e nos metadados.

## Direção visual

A direção foi aprovada a partir de https://lume-conecta-brasil.base44.app. A implementação do Lume é própria. Os retratos gerados da demonstração não integram o pacote público nem a aplicação publicada.

## Tipografia e ícones

Inter, Sora e JetBrains Mono são servidas localmente por pacotes `@fontsource-variable`, sob SIL Open Font License 1.1. As licenças acompanham os pacotes. Os ícones estão implementados em SVG em `src/components/Icon.astro`.
