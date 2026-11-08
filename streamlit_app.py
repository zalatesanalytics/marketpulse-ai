"""MarketPulse AI — Streamlit edition.

Streamlit Community Cloud → New app → set "Main file path" to: streamlit_app.py
Secrets (or environment variables): APIFY_TOKEN (required), OPENAI_API_KEY (optional).
"""

import os

import pandas as pd
import streamlit as st

from marketpulse.analyze import analyze
from marketpulse.scrape import RATE_PER_ITEM, build_query, scrape_all

PLATFORMS = ["reddit", "x", "youtube"]
SENTIMENT_COLORS = {"positive": "#6f9a48", "neutral": "#bdb7ac", "negative": "#c05a33"}

st.set_page_config(page_title="MarketPulse AI — social listening", page_icon="📡", layout="wide")


def secret(name, default=""):
    """Reads a Streamlit secret, falling back to an environment variable (and the field)."""
    try:
        if name in st.secrets:
            return str(st.secrets[name])
    except FileNotFoundError:
        pass
    return os.environ.get(name, default)


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
    '<p class="lede">Name a brand, pick the platforms, and the desk reads the past 90 days on Reddit, X and YouTube '
    "— then ranks the top 20 posts and scores each one's sentiment.</p>",
    unsafe_allow_html=True,
)

with st.sidebar:
    st.subheader("Keys")
    apify_field = st.text_input(
        "Apify API token", value=secret("APIFY_TOKEN"), type="password", help="Required. From console.apify.com → Settings → Integrations."
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
    days = st.select_slider("Look-back window", options=[7, 30, 90, 365], value=90, format_func=lambda d: f"{d} days")

with st.form("brief"):
    col_a, col_b = st.columns(2)
    brand = col_a.text_input("Brand or product", placeholder="e.g. Nike, Dove, On Running")
    category = col_b.text_input("Market category", placeholder="e.g. running shoes")
    competitors = st.text_input("Competitors (comma separated)", placeholder="Adidas, Hoka")
    goal = st.text_input("Decision this research supports", placeholder="Which launch message to lead with")
    platforms = st.multiselect("Platforms", PLATFORMS, default=PLATFORMS)
    submitted = st.form_submit_button("Run the read", type="primary")

if submitted:
    if not brand.strip():
        st.error("Name the brand or product first.")
    elif not platforms:
        st.error("Pick at least one platform.")
    elif not apify_field.strip():
        st.error("Add your Apify API token in the sidebar.")
    else:
        estimate = sum(max_items * RATE_PER_ITEM[p] for p in platforms)
        with st.spinner(f"Reading {', '.join(platforms)} — searching “{build_query(brand, competitors, category)}”"):
            posts, warnings, query = scrape_all(
                brand=brand.strip(),
                platforms=platforms,
                token=apify_field.strip(),
                competitors=competitors,
                category=category,
                max_items=max_items,
                days=days,
            )
            report = analyze(posts, brand.strip(), api_key=openai_field.strip(), model=model, base_url=base_url)

        st.session_state["report"] = report
        st.session_state["brief"] = {"brand": brand.strip(), "category": category, "goal": goal, "query": query}
        st.session_state["scrape_warnings"] = warnings
        st.session_state["estimate"] = estimate

report = st.session_state.get("report")
brief = st.session_state.get("brief", {})
scrape_warnings = st.session_state.get("scrape_warnings", [])

if not report:
    st.info("Fill the brief above and run the read. Nothing is stored — each run starts fresh.")
    st.stop()

for warning in scrape_warnings:
    st.warning(warning)

if not report.get("ok"):
    st.error(report.get("error", "The read came back empty."))
    st.stop()

posts = report["posts"]
counts = report["counts"]
average = report["average"]

st.divider()
st.subheader(f"{brief.get('brand', '')} — {len(posts)} posts ranked")
if brief.get("query"):
    st.caption(
        f"Search: {brief['query']} · window {days} days · {report['total_scraped']} posts read · "
        f"estimated Apify cost ${st.session_state.get('estimate', 0):.4f}"
    )

metric_cols = st.columns(4)
metric_cols[0].metric("Ranked posts", len(posts))
metric_cols[1].metric("Average sentiment", f"{average:+.2f}", help="-1 hostile to +1 advocating")
metric_cols[2].metric("Positive", counts["positive"])
metric_cols[3].metric("Negative", counts["negative"])

st.markdown(f"**The read-out.** {report['summary']}")
if report.get("recommendation"):
    st.markdown(f"**Recommended move.** {report['recommendation']}")

bar_cols = st.columns(3)
for column, label in zip(bar_cols, ("positive", "neutral", "negative")):
    share = counts[label] / len(posts) if posts else 0
    column.markdown(
        f'<span class="chip" style="background:{SENTIMENT_COLORS[label]}">{label} {counts[label]}</span> '
        f'<span class="score">{share:.0%}</span>',
        unsafe_allow_html=True,
    )
    column.progress(min(max(share, 0.0), 1.0))

if report["topics"]:
    st.subheader("Top topics")
    st.dataframe(
        pd.DataFrame(report["topics"]).rename(columns={"topic": "Topic", "mentions": "Posts", "sentiment": "Sentiment"}),
        hide_index=True,
        use_container_width=True,
    )

st.subheader("Ranked posts")
for post in posts:
    published = pd.to_datetime(post.get("published_at") or None, errors="coerce", utc=True)
    when = published.strftime("%d %b %Y") if pd.notna(published) else "date unknown"
    title = post["title"] if not post["url"] else f'<a href="{post["url"]}" target="_blank" rel="noopener">{post["title"]}</a>'
    body = f'<div class="body">{post["excerpt"][:260]}</div>' if post.get("excerpt") else ""
    evidence = f'<div class="meta">“{post["sentiment_evidence"]}”</div>' if post.get("sentiment_evidence") else ""
    st.markdown(
        f"""<div class="post">
          <div class="meta">#{post['rank']} · {post['platform']} · {post.get('community') or post.get('author') or 'public'} · {when}</div>
          <h4>{title}</h4>
          {body}
          <div><span class="chip" style="background:{SENTIMENT_COLORS[post['sentiment']]}">{post['sentiment']} {post['sentiment_score']:+.2f}</span>
          <span class="score"> {post['sentiment_reason']}</span></div>
          {evidence}
          <div class="meta" style="margin-top:6px">{int(post['engagement'])} likes · {int(post['comments'])} comments · {int(post['views'])} views · {int(post['shares'])} shares</div>
        </div>""",
        unsafe_allow_html=True,
    )

table = pd.DataFrame(
    [
        {
            "Rank": post["rank"],
            "Platform": post["platform"],
            "Title": post["title"],
            "Author": post.get("author", ""),
            "Community": post.get("community", ""),
            "Likes": int(post["engagement"]),
            "Comments": int(post["comments"]),
            "Views": int(post["views"]),
            "Sentiment": post["sentiment"],
            "Score": post["sentiment_score"],
            "Posted": post.get("published_at", ""),
            "URL": post.get("url", ""),
        }
        for post in posts
    ]
)
st.download_button(
    "Download the ranking (CSV)",
    table.to_csv(index=False).encode("utf-8"),
    file_name=f"{brief.get('brand', 'marketpulse').replace(' ', '-').lower()}-ranking.csv",
    mime="text/csv",
)

for warning in report.get("warnings", []):
    st.caption(f"Note: {warning}")