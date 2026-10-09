# Revisão de roteiro

API do fluxo de revisão de roteiro da Conty: o criador envia, a marca pede alteração com motivo e prazo, o criador reenvia, a marca aprova.

## Como rodar

Node 22 ou mais novo.

```bash
npm install
npm test          # testes, com relógio controlado
npm run dev       # API em http://127.0.0.1:3003 (SQLite em data/roteiros.sqlite)
npm run examples  # regenera EXAMPLES.md a partir da API real
```

Exemplos completos de request e response estão em [EXAMPLES.md](EXAMPLES.md).

## Modelo

Um **roteiro** tem um estado explícito e uma lista de **versões** imutáveis. Cada **pedido de alteração** fica preso à versão que ele avalia.

```
            pedir alteração (motivo + prazo)
 in_review ─────────────────────────────────▶ changes_requested
     │  ▲                                            │
     │  └──────────── nova versão ───────────────────┘
     │
     └── aprovar ──▶ approved   (terminal)
```

Toda resposta traz o roteiro inteiro: `status`, `current_version`, `allowed_actions`, `open_change_request` (com `overdue`), todas as `versions` e todos os `change_requests`. Quem consome a API não precisa adivinhar o estado nem o próximo passo.

| Método | Rota | Quem | Corpo |
|---|---|---|---|
| `POST` | `/scripts` | criador | `campaign_id`, `creator_id`, `content` |
| `GET` | `/scripts/:id` | ambos | |
| `POST` | `/scripts/:id/change-requests` | marca | `reason`, `due_date` (`YYYY-MM-DD`), `version` opcional |
| `POST` | `/scripts/:id/versions` | criador | `content` |
| `POST` | `/scripts/:id/approval` | marca | `version` opcional |

Erros vêm como `{ "error": "<código>", "message": "..." }`:

- **400:** corpo inválido, `reason_required`, `due_date_required` ou `invalid_due_date`.
- **404:** roteiro inexistente.
- **409:** `already_approved`, `invalid_state` ou `stale_version`.
- **422:** `due_date_past`.

## Regras

- **Motivo e prazo são obrigatórios** no pedido de alteração. Texto só com espaços conta como vazio. O prazo precisa ser uma data real (`2026-02-30` é recusado).
- **O prazo é um dia civil em `America/Sao_Paulo`**, e o último instante desse dia ainda vale. O dia é sempre calculado no fuso da marca, nunca pelo dia em UTC. Às 23:30 de 12/03 em São Paulo já é dia 13 em UTC, e o prazo de 12/03 continua valendo.
- **Pedido com prazo que já passou é recusado** (422).
- **Aprovar é terminal:** depois disso, nova versão, novo pedido de alteração e uma segunda aprovação respondem 409 `already_approved`.
- **Versões nunca são sobrescritas.** Cada nova versão aponta para o pedido de alteração que ela responde.
- **Decisão sobre versão desatualizada:** se a marca enviar `version` e o criador já tiver mandado outra, a decisão é recusada com 409 `stale_version`. Assim a marca não aprova um texto que não leu.
- Cada versão aceita no máximo um pedido de alteração, e só se pode mandar versão nova quando há um pedido aberto.

## Decisões e o que ficou de fora

- **Reenvio depois do prazo é aceito e marcado.** O enunciado diz que pedido com prazo vencido não vale, mas não diz o que acontece quando o criador reenvia atrasado. Preferi não bloquear: a versão entra com `submitted_late: true`, e o pedido aberto aparece com `overdue: true`. Com mais tempo, eu alinharia com operação se o atraso deve bloquear, notificar ou reabrir o prazo.
- **Sem autenticação nem papéis.** Qualquer chamador pode agir como marca ou como criador. Num produto real, `creator_id` e a marca da campanha viriam do token, e cada rota checaria o papel.
- **Sem notificações nem jobs.** O atraso só aparece quando alguém consulta o roteiro. Com mais tempo, um job avisaria o criador perto do prazo e a marca quando ele vence.
- **Fuso fixo.** O fuso da marca é sempre `America/Sao_Paulo`, como pede o enunciado. Se as marcas tiverem fusos diferentes, ele viraria um atributo da marca ou da campanha.
- **Uma linha por estado, sem event sourcing.** O histórico sai das versões e dos pedidos. Para uma auditoria completa (quem aprovou e quando, comentários livres), eu adicionaria uma tabela de eventos.
- **Concorrência:** as escritas usam transação `BEGIN IMMEDIATE` no SQLite, e `version` protege contra decisão sobre versão velha. Com várias instâncias e outro banco, eu usaria lock otimista pela coluna `current_version`.
- **Sem interface, upload ou vídeo**, como o enunciado permite.

## Uso de IA

<!-- revise e ajuste com as suas palavras antes de enviar -->
O código, os testes e este README foram escritos com o Claude (Claude Code). Eu revisei o modelo de estados, as regras de prazo e os testes do último instante do dia e do primeiro instante do dia seguinte, e rodei `npm test` e `npm run typecheck`.
