# Exemplos de request e response

Gerado por `npm run examples`. IDs encurtados.

## Criador envia o roteiro

_agora: 2026-03-10T15:00:00.000Z_

```http
POST /scripts

{
  "campaign_id": "cmp_1",
  "creator_id": "crt_1",
  "content": "Abro com o produto na mão e conto o problema que ele resolve."
}
```

```http
HTTP 201

{
  "id": "scr_123",
  "campaign_id": "cmp_1",
  "creator_id": "crt_1",
  "status": "in_review",
  "current_version": 1,
  "created_at": "2026-03-10T15:00:00.000Z",
  "approved_at": null,
  "allowed_actions": [
    "request_changes",
    "approve"
  ],
  "open_change_request": null,
  "versions": [
    {
      "number": 1,
      "content": "Abro com o produto na mão e conto o problema que ele resolve.",
      "submitted_at": "2026-03-10T15:00:00.000Z",
      "answers_change_request": null,
      "submitted_late": false
    }
  ],
  "change_requests": []
}
```

## Pedido de alteração sem prazo é recusado

_agora: 2026-03-10T15:00:00.000Z_

```http
POST /scripts/scr_123/change-requests

{
  "reason": "trocar o gancho dos 3 primeiros segundos"
}
```

```http
HTTP 400

{
  "error": "due_date_required",
  "message": "o pedido de alteração precisa de prazo"
}
```

## Marca pede alteração com motivo e prazo

_agora: 2026-03-10T15:00:00.000Z_

```http
POST /scripts/scr_123/change-requests

{
  "reason": "trocar o gancho dos 3 primeiros segundos",
  "due_date": "2026-03-12",
  "version": 1
}
```

```http
HTTP 200

{
  "id": "scr_123",
  "campaign_id": "cmp_1",
  "creator_id": "crt_1",
  "status": "changes_requested",
  "current_version": 1,
  "created_at": "2026-03-10T15:00:00.000Z",
  "approved_at": null,
  "allowed_actions": [
    "submit_version"
  ],
  "open_change_request": {
    "id": "chg_456",
    "version": 1,
    "reason": "trocar o gancho dos 3 primeiros segundos",
    "due_date": "2026-03-12",
    "requested_at": "2026-03-10T15:00:00.000Z",
    "overdue": false
  },
  "versions": [
    {
      "number": 1,
      "content": "Abro com o produto na mão e conto o problema que ele resolve.",
      "submitted_at": "2026-03-10T15:00:00.000Z",
      "answers_change_request": null,
      "submitted_late": false
    }
  ],
  "change_requests": [
    {
      "id": "chg_456",
      "version": 1,
      "reason": "trocar o gancho dos 3 primeiros segundos",
      "due_date": "2026-03-12",
      "requested_at": "2026-03-10T15:00:00.000Z",
      "overdue": false
    }
  ]
}
```

## Criador reenvia às 23:30 do dia do prazo (UTC já é dia 13)

_agora: 2026-03-13T02:30:00.000Z_

```http
POST /scripts/scr_123/versions

{
  "content": "Começo com a pergunta que todo mundo faz nos comentários."
}
```

```http
HTTP 200

{
  "id": "scr_123",
  "campaign_id": "cmp_1",
  "creator_id": "crt_1",
  "status": "in_review",
  "current_version": 2,
  "created_at": "2026-03-10T15:00:00.000Z",
  "approved_at": null,
  "allowed_actions": [
    "request_changes",
    "approve"
  ],
  "open_change_request": null,
  "versions": [
    {
      "number": 1,
      "content": "Abro com o produto na mão e conto o problema que ele resolve.",
      "submitted_at": "2026-03-10T15:00:00.000Z",
      "answers_change_request": null,
      "submitted_late": false
    },
    {
      "number": 2,
      "content": "Começo com a pergunta que todo mundo faz nos comentários.",
      "submitted_at": "2026-03-13T02:30:00.000Z",
      "answers_change_request": "chg_456",
      "submitted_late": false
    }
  ],
  "change_requests": [
    {
      "id": "chg_456",
      "version": 1,
      "reason": "trocar o gancho dos 3 primeiros segundos",
      "due_date": "2026-03-12",
      "requested_at": "2026-03-10T15:00:00.000Z",
      "overdue": false
    }
  ]
}
```

## Marca aprova a versão 2

_agora: 2026-03-13T02:30:00.000Z_

```http
POST /scripts/scr_123/approval

{
  "version": 2
}
```

```http
HTTP 200

{
  "id": "scr_123",
  "campaign_id": "cmp_1",
  "creator_id": "crt_1",
  "status": "approved",
  "current_version": 2,
  "created_at": "2026-03-10T15:00:00.000Z",
  "approved_at": "2026-03-13T02:30:00.000Z",
  "allowed_actions": [],
  "open_change_request": null,
  "versions": [
    {
      "number": 1,
      "content": "Abro com o produto na mão e conto o problema que ele resolve.",
      "submitted_at": "2026-03-10T15:00:00.000Z",
      "answers_change_request": null,
      "submitted_late": false
    },
    {
      "number": 2,
      "content": "Começo com a pergunta que todo mundo faz nos comentários.",
      "submitted_at": "2026-03-13T02:30:00.000Z",
      "answers_change_request": "chg_456",
      "submitted_late": false
    }
  ],
  "change_requests": [
    {
      "id": "chg_456",
      "version": 1,
      "reason": "trocar o gancho dos 3 primeiros segundos",
      "due_date": "2026-03-12",
      "requested_at": "2026-03-10T15:00:00.000Z",
      "overdue": false
    }
  ]
}
```

## Roteiro aprovado não aceita nova versão

_agora: 2026-03-13T02:30:00.000Z_

```http
POST /scripts/scr_123/versions

{
  "content": "mais uma"
}
```

```http
HTTP 409

{
  "error": "already_approved",
  "message": "roteiro aprovado não aceita nova versão nem pedido de alteração"
}
```
