"""MarketPulse AI: Streamlit edition.

Streamlit Community Cloud > New app > Main file path: streamlit_app.py
Secrets or environment variables: APIFY_TOKEN (required), OPENAI_API_KEY (optional).
"""

import os
from html import escape
from urllib.parse import urlsplit

import pandas as pd
import streamlit as st

from marketpulse.analyze import analyze
from marketpulse.scrape import RATE_PER_ITEM, build_query, scrape_all

PLATFORMS = ["reddit", "x", "youtube"]
SENTIMENT_COLORS = {
    "positive": "#6f9a48",
    "neutral": "#bdb7ac",
    "negative": "#c05a33",
}

st.set_page_config(page_title="MarketPulse AI: social listening", page_icon="📡", layout="wide")


def secret(name, default=""):
    """Read a Streamlit secret, falling back to an environment variable."""
    try:
        if name in st.secrets:
            return str(st.secrets[name])
    except FileNotFoundError:
        pass
    return os.environ.get(name, default)


def safe_post_url(value):
    """Only expose HTTP(S) links in rendered HTML."""
    if not isinstance(value, str):
        return ""
    url = value.strip()
    parsed = urlsplit(url)
    return url if parsed.scheme.lower() in ("http", "https") and parsed.netloc else ""


st.markdown(
    """
    <style>
      .block-container { max-width: 1080px; padding-top: 2.4rem; }
      h1, h2, h3 { font-family: Georgia, "Times New Roman", serif; letter-spacing: -0.01em; }
      .lede { color: #6e695e; font-size: 0.95rem; margin-bottom: 1.4rem; }
      .post { border: 1px solid #e2dfd9; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px; background: #fff; }
      .post h4 { margin: 0 0 6px; font-size: 0.98rem; line-height: 1.4; }
      .post .meta { color: #6e695e; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.08em; }
      .post .body { font-size: 0.88rem; color: #1a1814; margin: 8px 0 6px; }
      .chip { display: inline-block; font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; color: #fff; }
      .score { font-variant-numeric: tabular-nums; color: #6e695e; font-size: 0.76rem; }
    </style>
    """,
    unsafe_allow_html=True,
)

st.title("MarketPulse AI")
st.markdown(
    '<p class="lede">Name a brand, pick the platforms, and the desk reads recent posts on Reddit, X and YouTube '
    'then ranks the top 20 posts and scores each one\'s sentiment.</p>',
    unsafe_allow_html=True,
)

with st.sidebar:
    st.subheader("Keys")
    apify_field = st.text_input(
        "Apify API token",
        value=secret("APIFY_TOKEN"),
        type="password",
        help="Required. From console.apify.com > Settings > Integrations.",
    )
    openai_field = st.text_input(
        "LLM API key (optional)",
        value=secret("OPENAI_API_KEY"),
        type="password",
        help="Without it, sentiment falls back to a word list instead of a language model.",
    )
    model = st.text_input("Model", value=secret("OPENAI_MODEL", "gpt-4o-mini"))
    base_url = st.text_input("API base URL", value=secret("OPENAI_BASE_URL", "https://api.openai.com/v1"))
    st.divider()
    st.subheader("Scope")
    max_items = st.slider("Posts per platform", 5, 50, 15, step=5)
    days = st.select_slider(
        "Look-back window",
        options=[7, 30, 90, 365],
        value=90,
        format_func=lambda d: f"{d} days",
    )

# Keep the FORM key distinct from the data key in st.session_state.

