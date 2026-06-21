# CultureBotEval — Πλήρης εφαρμογή (multi-LLM)

Όλα τα τελικά αρχεία της εφαρμογής, έτοιμα για deploy στο GitHub Pages.

## Δομή

```
CultureBotEval/
├── index.html                      # Login (αμετάβλητο)
├── role.html                       # Αρχική με tabs: Create · Modify · Evaluation · Statistics · Admin  [ΕΝΗΜΕΡΩΘΗΚΕ]
├── creator.html                    # Create — δυναμικό multi-LLM (Πλήθος LLMs)  [ΕΝΗΜΕΡΩΘΗΚΕ]
├── modify.html                     # Modify — επεξεργασία/διαγραφή sessions  [ΝΕΟ]
├── evaluator.html                  # Evaluation — λίστα Personas  [ΕΝΗΜΕΡΩΘΗΚΕ: rename]
├── evaluationlist4persona.html     # Sessions ανά Persona — multi-LLM εμφάνιση & inline edit  [ΕΝΗΜΕΡΩΘΗΚΕ]
├── evaluation.html                 # Νέα αξιολόγηση — όλα τα LLMs + 12 κριτήρια/LLM + 2 ερωτήσεις query-level  [ΕΝΗΜΕΡΩΘΗΚΕ]
├── statistics.html                 # Landing reports (κείμενο 12 κριτήρια)  [ΕΝΗΜΕΡΩΘΗΚΕ]
├── report-sessions.html            # iframe loader (αμετάβλητο)
├── report-criteria.html            # iframe loader (αμετάβλητο)
├── admin.html                      # buildFile1/buildFile2 multi-LLM aware  [ΕΝΗΜΕΡΩΘΗΚΕ]
├── styles.css                      # Κοινό stylesheet (αμετάβλητο)
├── config.js                       # Firebase config (τοπικό· στο deploy το παράγει το workflow)
├── reports/                        # Παράγονται από το admin (Generate & Push Both)
└── .github/workflows/deploy.yml    # GitHub Pages auto-deploy (αμετάβλητο)
```

## Νέο data model (σύνοψη)

```jsonc
sessions/{CODE} = {
  creator, creatorUid, creatorEmail, personaTitle, personaRole,
  guidelines, query, createdAt, updatedAt,
  llmCount: N,
  llms: [ {title, description}, … ],
  evaluations: {
    {key}: {
      evaluator, evaluatorEmail, evaluatorUid, timestamp, lastEdited,
      llms: { 0:{llmTitle,ratings:{1..10},comments:{1..10}}, 1:{…} }
    }
  }
}
```

Όλες οι σελίδες κάνουν **normalize** και διαβάζουν και το παλιό format (`llmTitle` / `evaluations[].ratings`), ώστε παλιά & νέα sessions να συνυπάρχουν.

## Deploy
1. Ανέβασε όλα τα αρχεία στο root του repo.
2. Ρύθμισε τα GitHub Secrets (FIREBASE_API_KEY κ.λπ.) — το `deploy.yml` παράγει το `config.js`.
   (Ή άφησε το committed `config.js` με τα δικά σου κλειδιά για τοπική χρήση.)
3. Settings → Pages → ενεργό. Το push στο `main` κάνει auto-deploy.
4. Για τη βάση: import το `cultureboteval-migrated.json` (βλ. MIGRATION-README).
5. Admin panel → **Generate & Push Both** για να παραχθούν τα reports από τη multi-LLM βάση.

## Σημείωση ασφαλείας
Το `config.js` εδώ περιέχει τα κλειδιά του υπάρχοντος project. Αν φτιάχνεις νέο Firebase project (νέα βάση), αντικατέστησε με το νέο config — βλ. προηγούμενες οδηγίες.
