# CultureBot Evaluation System

Multi-page web application with Firebase Authentication and Realtime Database. Hosted on GitHub Pages — no server required.

---  
    
## User Flow:

```
index.html  →  role.html  →  creator.html
    (login)   (choose role)  (verified only)

index.html  →  role.html  →  evaluator.html         →     evaluationlist2persona.html  →  evaluation.html?session=CODE
 (login)   (choose role)   (sessions personas list)          (sessions list)                (evaluation form)
```

---


## Evaluation Criteria (10):

| # | Criterion | Options |
|---|-----------|---------|
| 1 | Hallucination Flag | No Hallucination · Minor · Major · Cannot Determine |
| 2 | Query Relevance | Fully · Mostly · Partially · Not Relevant |
| 3 | Justification Quality | Excellent · Good · Fair · Poor |
| 4 | Evidence Grounding | Well · Mostly · Partially · Ungrounded |
| 5 | Clarity | Very Clear · Clear · Somewhat · Unclear |
| 6 | Result Usefulness | Very Useful · Useful · Somewhat · Not Useful |
| 7 | Bias | No · Slight · Moderate · Significant |
| 8 | Diversity | High · Moderate · Low · None |
| 9 | Completeness / Variety / Representative | Excellent · Good · Fair · Poor |
| 10 | Needed Logical Steps | All · Mostly · Partially · Missing |

---

## Firebase Data Structure:

```json
{
  "verified_creators": {
    "uid_of_verified_user": true
  },
  "sessions": {
    "AB12CD": {
      "creator":        "Maria Papadopoulou",
      "creatorEmail":   "maria@example.com",
      "creatorUid":     "uid_abc123",
      "personaTitle":   "Customer Support Agent",
      "personaRole":    "You are a helpful assistant...",
      "guidelines":     "Focus on factual answers.",
      "llmTitle":       "GPT-4o",
      "llmDescription": "OpenAI GPT-4o, May 2024 version...",
      "query":          "What is the refund policy?",
      "createdAt":      "06/04/2026, 14:30",
      "evaluations": {
        "-NxAbc123": {
          "evaluator":      "Nikos Georgiou",
          "evaluatorEmail": "nikos@example.com",
          "evaluatorUid":   "uid_xyz789",
          "timestamp":      "06/04/2026, 15:10",
          "ratings": {
            "1": "No Hallucination",
            "2": "Fully Relevant"
          },
          "comments": {
            "1": "",
            "2": "The answer was directly on point."
          }
        }
      }
    }
  }
}
```

## Tech Stack :

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5 · CSS3 · Vanilla JavaScript |
| Authentication | Firebase Authentication (Email + Google) |
| Database | Firebase Realtime Database |
| Hosting | GitHub Pages |

---

## License :

MIT
