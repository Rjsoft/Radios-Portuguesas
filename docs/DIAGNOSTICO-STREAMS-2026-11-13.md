# Diagnóstico de streams — 13/11/2026

Origem: [GitHub Actions — execução 43440089541](https://github.com/Rjsoft/Radios-Portuguesas/actions/runs/43440089541).
Comando: `node scripts/check-streams.mjs` (Node.js 22, Ubuntu GitHub Actions).

## Resumo

| Métrica | Resultado |
| --- | ---: |
| Streams configurados e testados | 43 |
| Responderam corretamente à verificação de conectividade | 32 |
| Erro de cadeia TLS / resultado inconclusivo | 11 |
| Falhas definitivas detetadas pelo verificador | 0 |
| Websites com HTTP 403 | 2 |
| Logótipos em falta | 0 |

## Streams com verificação inconclusiva (TLS)

- Rádio Regional
- Rádio Regional Portugal
- Rádio Regional Popular
- Rádio Regional Love Songs
- Rádio Regional Brasil
- Rádio Regional Oldies
- Rádio Regional Rock
- Rádio Regional Dance
- Rádio Regional Latina
- Rádio Regional Clássica
- Rádio Regional Inspiration

Todos utilizam `play.radioregional.pt`. O verificador Node.js reportou uma cadeia de certificados incompleta; **não** é possível concluir que falham em todos os browsers. A configuração TLS deverá ser corrigida no servidor de origem e validada em clientes reais.

## Websites com resposta 403

- Rádio Renascença — site institucional
- TSF — site institucional

Os **streams** correspondentes responderam corretamente. HTTP 403 no website pode resultar de regras anti-bot e não demonstra indisponibilidade para utilizadores.

## Interpretação e próximos passos

- A execução do workflow terminou em **success**, porque o passo do diagnóstico foi configurado com `continue-on-error: true`. O comando de diagnóstico **terminou com código 1**, devido aos 11 casos TLS inconclusivos. Não confundir o resultado do job com a aprovação de todos os streams.
- Evitar retirar automaticamente rádios ou substituir URLs sem validar em browsers reais.
- Testar CM Rádio (HLS) no Chrome, Firefox, Edge, Android e Safari/iOS, incluindo CORS e possíveis limitações de autoplay.
- Confirmar os 11 streams Rádio Regional em navegadores e analisar a cadeia TLS num teste dedicado.
- Repetir monitorização em diferentes horários antes de classificar indisponibilidades permanentes.

Os testes são de **conectividade**, não garantem que o áudio seja audível nem que os formatos sejam suportados em todos os dispositivos.
