# Deploying this repo to Streamlit Community Cloud

The Base44 app in `src/` is a TanStack Start (JavaScript) app. Streamlit only runs Python, so this repo also
carries a standalone Python edition that reuses the same Apify scrapers and ranking rules.

## Streamlit settings

1. share.streamlit.io → **Create app** → **Deploy a public app from GitHub**
2. Repository: this repo · Branch: `main` (or whichever branch you use)
3. **Main file path:** `streamlit_app.py`
4. **Advanced settings → Secrets**, paste:

```toml
APIFY_TOKEN = "your_apify_api_token_here"
OPENAI_API_KEY = "your_llm_api_key_here"   # optional
OPENAI_MODEL = "gpt-4o-mini"
```

`APIFY_TOKEN` is required. Without `OPENAI_API_KEY` the app still runs, scoring sentiment with a word list
instead of a language model. Any OpenAI-compatible endpoint works — set `OPENAI_BASE_URL` to change it.

## Files

- `streamlit_app.py` — the Streamlit UI and entry point
- `marketpulse/scrape.py` — Apify actors (Reddit, X, YouTube), normalization, query building
- `marketpulse/analyze.py` — brand gate, ranking, sentiment scoring, topics
- `requirements.txt` — Streamlit, requests, pandas

## Notes

- `package.json`, `src/` and the rest of the Base44 app are ignored by Streamlit Cloud; only `requirements.txt`
  and the files above matter to it.
- Streamlit runs a script top to bottom on every interaction: keys live in the sidebar so a rerun does not
  need a reload, and the last report is kept in `st.session_state`.
- Each run calls Apify live, so results and cost vary with the brand and the platforms chosen.