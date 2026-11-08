"""Ranking, brand gating and sentiment scoring for the Streamlit app."""

import json
import re
from collections import Counter

import requests

from marketpulse.scrape import rank_score

TOP_N = 20
CANDIDATES = 30

SENTIMENTS = ("positive", "neutral", "negative")

_STOP = {
    "about", "after", "again", "all", "also", "and", "any", "are", "because", "been", "but", "can", "could",
    "did", "does", "for", "from", "get", "got", "had", "has", "have", "her", "here", "him", "his", "how",
    "into", "its", "just", "like", "more", "most", "much", "not", "now", "one", "only", "our", "out", "over",
    "really", "should", "some", "still", "such", "than", "that", "the", "their", "them", "then", "there",
    "these", "they", "this", "those", "too", "very", "was", "were", "what", "when", "where", "which", "who",
    "will", "with", "would", "you", "your", "yours", "im", "ive", "dont", "doesnt", "thats", "its", "amp",
}

_POSITIVE = {
    "amazing", "awesome", "beautiful", "best", "better", "comfy", "comfortable", "durable", "excellent",
    "fantastic", "favorite", "glad", "good", "gorgeous", "great", "happy", "impressed", "improved", "love",
    "loved", "lovely", "nice", "perfect", "recommend", "solid", "stunning", "superb", "worth", "wow",
}

_NEGATIVE = {
    "awful", "bad", "broken", "cheap", "complaint", "crap", "disappointed", "disappointing", "expensive",
    "fail", "failed", "fake", "hate", "hated", "issue", "overpriced", "poor", "problem", "refund", "returned",
    "ripped", "rude", "sucks", "terrible", "uncomfortable", "worse", "worst",
}


def brand_keywords(brand):
    """The brand itself plus its meaningful words, for the brand gate."""
    words = [word for word in re.findall(r"[a-z0-9]+", str(brand).lower()) if len(word) > 1]
    return [str(brand).lower().strip()] + words


def mentions_brand(post, keywords):
    haystack = f"{post.get('title', '')} {post.get('excerpt', '')}".lower()
    return any(keyword and keyword in haystack for keyword in keywords)


def gate_by_brand(posts, brand):
    """Drops posts that never name the brand — a same-named athlete, game or place."""
    keywords = brand_keywords(brand)
    kept = [post for post in posts if mentions_brand(post, keywords)]
    return kept, len(posts) - len(kept)


def select_candidates(posts, limit=CANDIDATES):
    """Keeps every platform represented, then fills the pool by engagement."""
    ranked = sorted(posts, key=rank_score, reverse=True)
    selected = []
    for platform in ("reddit", "x", "youtube"):
        for post in [p for p in ranked if p["platform"] == platform][:5]:
            if post not in selected:
                selected.append(post)
    for post in ranked:
        if len(selected) >= limit:
            break
        if post not in selected:
            selected.append(post)
    return selected[:limit]


def _lex_score(text):
    words = re.findall(r"[a-z']+", text.lower())
    positive = sum(1 for word in words if word in _POSITIVE)
    negative = sum(1 for word in words if word in _NEGATIVE)
    hits = positive + negative
    if hits < 2:
        return "neutral", 0.0, "Too little signal in the text to judge."
    score = max(-1.0, min(1.0, (positive - negative) / hits))
    label = "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral"
    return label, round(score, 2), f"{positive} positive and {negative} negative cues in the text."


def _keywords(text):
    words = re.findall(r"[a-z']{4,}", text.lower())
    return [word for word in words if word not in _STOP]


def _topics(posts, brand):
    """Ranked topics by how many posts discuss them (no invented counts)."""
    brand_words = set(brand_keywords(brand))
    counts, sentiment_of = Counter(), {}
    for post in posts:
        text = f"{post.get('title', '')} {post.get('excerpt', '')}"
        seen = set()
        for word in _keywords(text):
            if word in brand_words or word in seen:
                continue
            seen.add(word)
            counts[word] += 1
            sentiment_of.setdefault(word, []).append(post.get("sentiment", "neutral"))
    topics = []
    for word, mentions in counts.most_common(10):
        if mentions < 2:
            continue
        labels = sentiment_of.get(word, ["neutral"])
        dominant = Counter(labels).most_common(1)[0][0]
        topics.append({"topic": word, "mentions": mentions, "sentiment": dominant})
    return topics


def _summary(posts, brand, counts, average):
    ranked = sorted(posts, key=rank_score, reverse=True)[:3]
    lead = f"{len(posts)} posts about {brand} were ranked across {', '.join(sorted({p['platform'] for p in posts}))}."
    tone = (
        "Sentiment leans positive"
        if average > 0.15
        else "Sentiment leans negative"
        if average < -0.15
        else "Sentiment is mixed"
    )
    detail = f" {tone} (average score {average:+.2f}; {counts['positive']} positive, {counts['neutral']} neutral, {counts['negative']} negative)."
    highlights = " ".join(f"“{post['title'][:90]}” {post['platform']}." for post in ranked)
    return f"{lead}{detail} Loudest posts: {highlights}"


def _llm_available(api_key):
    return bool(api_key and api_key.strip())


def _score_with_llm(posts, brand, api_key, model, base_url):
    listing = "\n".join(
        f"[{i}] ({p['platform']}, {p['community'] or p['author']}, {int(p['engagement'])} likes, {int(p['comments'])} comments) "
        f"{p['title']} — {p['excerpt'][:240]}"
        for i, p in enumerate(posts)
    )
    prompt = (
        f"Score these public posts for sentiment toward the brand \"{brand}\".\n"
        "For every numbered post, judge sentiment toward the brand (positive, neutral or negative) and a score "
        "from -1 (hostile) to 1 (advocating). Quote at most 15 words copied exactly from the post as evidence, "
        "and mark off_topic true when the post is not actually about this brand (a person, place, team, film or "
        "game with the same name).\n"
        "Answer with JSON only: {\"posts\": [{\"index\": 1, \"sentiment\": \"positive\", \"score\": 0.6, "
        "\"reason\": \"short reason\", \"evidence\": \"words from the post\", \"off_topic\": false}], "
        "\"summary\": \"2-3 sentences\", \"recommendation\": \"2-3 sentences\"}\n\n"
        f"POSTS:\n{listing}"
    )
    response = requests.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        },
        timeout=120,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Scoring failed ({response.status_code}). {response.text[:160]}")
    content = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def analyze(posts, brand, api_key="", model="gpt-4o-mini", base_url="https://api.openai.com/v1"):
    """Gates by brand, ranks the top 20 and scores each one. Returns a report dict."""
    warnings = []
    if not posts:
        return {"ok": False, "error": f"No public posts turned up for {brand}."}

    gated, dropped = gate_by_brand(posts, brand)
    if dropped:
        warnings.append(f"{dropped} post{'s' if dropped != 1 else ''} never mentioned {brand} and were left out.")
    if not gated:
        return {"ok": False, "error": f"Nothing in the pull actually mentioned {brand}."}

    candidates = select_candidates(gated)

    analysis, scored = None, {}
    if _llm_available(api_key):
        try:
            analysis = _score_with_llm(candidates, brand, api_key, model, base_url)
            for row in analysis.get("posts", []):
                index = int(row.get("index", 0)) - 1
                if 0 <= index < len(candidates):
                    scored[index] = row
        except (RuntimeError, ValueError, KeyError, TypeError) as error:
            warnings.append(f"LLM scoring was unavailable ({error}); a word-list score was used instead.")
    else:
        warnings.append("No LLM key set, so sentiment comes from a word list rather than a language model.")

    if not _llm_available(api_key) or not scored:
        for index, post in enumerate(candidates):
            if index in scored:
                continue
            label, score, reason = _lex_score(f"{post['title']} {post['excerpt']}")
            scored[index] = {"sentiment": label, "score": score, "reason": reason, "evidence": "", "off_topic": False}

    survivors = [
        (post, scored[index])
        for index, post in enumerate(candidates)
        if not scored[index].get("off_topic")
    ]
    off_topic = len(candidates) - len(survivors)
    if off_topic:
        warnings.append(f"{off_topic} post{'s' if off_topic != 1 else ''} only shared the name and were dropped as off-topic.")

    final = []
    for platform in ("reddit", "x", "youtube"):
        for post, row in [entry for entry in survivors if entry[0]["platform"] == platform][:4]:
            if (post, row) not in final:
                final.append((post, row))
    for entry in survivors:
        if len(final) >= TOP_N:
            break
        if entry not in final:
            final.append(entry)

    kept = sorted(final[:TOP_N], key=lambda entry: rank_score(entry[0]), reverse=True)

    ranked = []
    for position, (post, row) in enumerate(kept, start=1):
        sentiment = row.get("sentiment") if row.get("sentiment") in SENTIMENTS else "neutral"
        score = max(-1.0, min(1.0, float(row.get("score") or 0)))
        if sentiment == "positive":
            score = max(score, 0.2)
        elif sentiment == "negative":
            score = min(score, -0.2)
        ranked.append(
            {
                **post,
                "rank": position,
                "sentiment": sentiment,
                "sentiment_score": round(score, 2),
                "sentiment_reason": str(row.get("reason") or "Not scored")[:160],
                "sentiment_evidence": str(row.get("evidence") or "")[:240],
            }
        )

    counts = {label: sum(1 for post in ranked if post["sentiment"] == label) for label in SENTIMENTS}
    average = sum(post["sentiment_score"] for post in ranked) / len(ranked)

    return {
        "ok": True,
        "posts": ranked,
        "counts": counts,
        "average": round(average, 2),
        "topics": _topics(ranked, brand),
        "summary": str((analysis or {}).get("summary") or _summary(ranked, brand, counts, average)),
        "recommendation": str((analysis or {}).get("recommendation") or ""),
        "total_scraped": len(posts),
        "warnings": warnings,
    }