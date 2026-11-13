# Plano de testes funcionais — Rádios Portugal Live

Este plano complementa os testes automáticos (sintaxe e estrutura do catálogo). **Não considerar uma rádio operacional apenas porque o servidor responde HTTP 200.**

## Ambientes

- Chrome e Edge atuais (Windows)
- Firefox atual (Windows ou Linux)
- Chrome (Android)
- Safari (iOS)
- Modo instalado (PWA) em Android e iOS, quando disponível

## Reprodução e estados

1. Abrir a aplicação sem favoritos nem rádio previamente selecionada: nenhuma reprodução automática.
2. Iniciar Rádio Comercial: observar «A ligar…» e depois «Em direto», e confirmar áudio audível.
3. Pausar e retomar a mesma rádio; não deve ficar áudio da ligação anterior.
4. Alternar rapidamente entre Rádio Comercial, RFM e Antena 1, inclusive durante «A ligar…». Só a última rádio selecionada deve tocar.
5. Pausar imediatamente após escolher uma rádio; não deve começar a tocar após alguns segundos.
6. Alternar de uma rádio HLS para uma MP3 antes da biblioteca HLS acabar de carregar; a rádio HLS não pode recomeçar.
7. Interromper a rede durante a ligação; verificar mensagem de erro e botão «Tentar novamente».
8. Interromper a rede durante reprodução; verificar estado e capacidade de recuperar manualmente.
9. Testar volume e silêncio; em iOS o controlo de volume interno pode não ser suportado.
10. Verificar identificação de rádio e comandos no ecrã bloqueado; testar auscultadores e comandos multimédia.

## HLS — CM Rádio

1. Reproduzir no Safari com HLS nativo.
2. Reproduzir em Chrome, Edge e Firefox com hls.js; verificar acesso ao script e pedidos ao manifesto e segmentos.
3. Se houver bloqueio de CORS, recolher URL e erro da consola de desenvolvimento. A aplicação não consegue ultrapassar restrições impostas pelo servidor de origem.
4. Testar ligação lenta, pausa durante o carregamento, mudança rápida de estação e botão «Tentar novamente».
5. Confirmar políticas de reprodução automática de cada navegador: um play() iniciado após carregamento assíncrono pode exigir nova interação do utilizador.

## PWA / acessibilidade

1. Instalar a PWA e validar ícone, nome e abertura.
2. Atualizar a app e confirmar que favoritos, volume e tema persistem.
3. Abrir offline: a interface deve surgir, mas streams não devem tocar.
4. Usar apenas teclado: pesquisar, filtrar, favoritar, ouvir/pausar, volume e tema.
5. Confirmar mensagens de estado com leitor de ecrã.

## Critérios de aceitação

- Nenhuma estação duplicada a tocar.
- Nunca reproduzir áudio após pausa explícita ou após troca para outra rádio.
- Erro compreensível e caminho para repetir tentativa.
- Os testes de CI devem passar.
- HLS deve ser testado realmente nos ambientes acima antes de integrar o PR.
- Não modificar a branch `main` enquanto existirem falhas relevantes.
