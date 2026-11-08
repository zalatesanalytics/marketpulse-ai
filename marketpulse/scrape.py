"""Apify scrapers for Reddit, X and YouTube (Python port of the app's pipeline)."""

import re
import requests

ACTORS = {
    "reddit": "apify~reddit-scraper",
    "x": "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest",
    "youtube": "streamers~youtube-scraper",
}

RATE_PER_ITEM = {"reddit": 0.0025, "x": 0.0009, "youtube": 0.0024}

TIMEOUT_SECONDS = 120

_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " "}


def clean(value):
    text = str(value or "")
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"&[a-z#0-9]+;", lambda m: _ENTITIES.get(m.group(0).lower(), " "), text, flags=re.I)
    text = re.sub(r"https?://\S+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _pick_num(*values):
    for value in values:
        if isinstance(value, (int, float)) and value == value:
            return value
        if isinstance(value, str) and value.strip():
            try:
                return float(value)
            except ValueError:
                continue
    return 0


def _pick_str(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return clean(value)
    return ""


def _pick_url(*values):
    for value in values:
        if isinstance(value, str) and re.match(r"^https?://\S+$", value.strip(), re.I):
            return value.strip()
    return ""


def _field_at(item, path):
    value = item
    for key in path.split("."):
        value = value.get(key) if isinstance(value, dict) else None
    return value


def _pick_field(item, paths=()):
    for path in paths:
        number = _pick_num(_field_at(item, path))
        if number:
            return number
    return 0


def _to_iso(value):
    """Normalizes epoch seconds, epoch millis and date strings to one ISO timestamp."""
    if value in ("", None):
        return ""
    from datetime import datetime, timezone

    try:
        if isinstance(value, (int, float)) or re.fullmatch(r"\d{10,13}", str(value)):
            epoch = float(value)
            seconds = epoch / 1000 if epoch >= 1e12 else epoch
            return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat()
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.isoformat()
    except (ValueError, OSError, OverflowError):
        return ""


FIELDS = {
    "reddit": {
        "likes": ["upVotes", "upvoteCount", "score"],
        "comments": ["numberOfComments", "commentsCount", "commentCount"],
        "views": ["viewCount", "views"],
        "shares": ["crosspostCount", "crossposts", "shareCount"],
        "community": ["communityName", "subreddit"],
    },
    "x": {
        "likes": ["likeCount", "likes"],
        "comments": ["replyCount", "replyCounts", "commentCount"],
        "views": ["viewCount", "viewsCount"],
        "shares": [],
        "retweets": ["retweetCount", "retweets"],
        "reposts": ["quoteCount", "repostCount", "reposts"],
        "community": ["author.userName", "username", "authorName"],
    },
    "youtube": {
        "likes": ["likes", "likeCount"],
        "comments": ["commentsCount", "commentCount"],
        "views": ["viewCount", "views"],
        "shares": ["shareCount", "shares"],
        "community": ["channelName", "channel.name"],
    },
}


def _time_window(days):
    if days <= 1:
        return "day"
    if days <= 7:
        return "week"
    if days <= 31:
        return "month"
    return "year"


def build_input(platform, query, max_items, days):
    if platform == "reddit":
        return {
            "scrapeMode": "posts",
            "searchQueries": [query],
            "searchSort": "top",
            "searchTimeFilter": _time_window(days),
            "maxSearchResultsPerQuery": max_items,
            "includeNsfw": False,
        }
    if platform == "youtube":
        return {
            "searchQueries": [query],
            "maxResults": max_items,
            "sortingOrder": "relevance",
            "dateFilter": _time_window(days),
            "transcriptionAndSubtitle": "NONE",
        }
    return {"searchTerms": [query], "maxItems": max_items, "queryType": "Top"}


def normalize(platform, item):
    if not isinstance(item, dict):
        return None

    text = _pick_str(item.get("text"), item.get("fullText"), item.get("body"), item.get("description"))
    title = _pick_str(item.get("title"), item.get("postTitle")) or text[:140]
    if not title:
        return None

    author = _pick_str(
        item.get("authorName"),
        item.get("username"),
        _field_at(item, "author.userName"),
        _field_at(item, "author.username"),
        _field_at(item, "author.name"),
        item.get("channelName"),
        item.get("author") if isinstance(item.get("author"), str) else "",
    )

    url = _pick_url(item.get("url"), item.get("link"), item.get("postUrl"), item.get("videoUrl"), item.get("permalink"))
    if not url and platform == "x" and item.get("id"):
        url = f"https://x.com/i/status/{item['id']}"

    fields = FIELDS.get(platform, {})
    community = _pick_str(
        *[_field_at(item, path) for path in fields.get("community", [])],
        item.get("communityName"),
        item.get("subreddit"),
        item.get("channelName"),
        _field_at(item, "channel.name"),
    )

    retweets = _pick_field(item, fields.get("retweets", []))
    reposts = _pick_field(item, fields.get("reposts", []))
    published = _pick_str(item.get("createdAt"), item.get("date"), item.get("publishedAt"), item.get("uploadDate"), item.get("created"))

    return {
        "platform": platform,
        "title": title[:300],
        "excerpt": (_pick_str(item.get("body"), item.get("text"), item.get("description")) if platform != "x" else "")[:1200],
        "author": author[:80],
        "community": community[:80],
        "url": url,
        "engagement": _pick_field(item, fields.get("likes", [])),
        "comments": _pick_field(item, fields.get("comments", [])),
        "views": _pick_field(item, fields.get("views", [])),
        "shares": _pick_field(item, fields.get("shares", [])) or (retweets + reposts),
        "retweets": retweets,
        "reposts": reposts,
        "published_at": _to_iso(published or _pick_num(item.get("created_utc"), item.get("createdUtc"), item.get("timestamp"))),
    }


def rank_score(post):
    """Engagement with comments weighted double and views lightly, as in the app."""
    return post["engagement"] + post["comments"] * 2 + post["views"] * 0.01


_STOP = {"a", "an", "and", "or", "the", "of", "for", "with", "in", "on"}


def _category_words(category):
    words = re.sub(r"[^a-z0-9\s-]", " ", str(category or "").lower()).split()
    return " ".join([word for word in words if word and word not in _STOP][:2])


def build_query(brand, competitors="", category="", search=""):
    """Keeps the search pinned to the brand plus its category so same-named things don't match."""
    names = [brand] + [name.strip() for name in str(competitors or "").split(",")]
    names = [name for name in names if name][:4]
    if not names:
        return brand
    name, rest = names[0], names[1:]
    pinned = " ".join(str(search or "").split()[:6])
    focus = pinned or " ".join(part for part in (name, _category_words(category)) if part)
    return " OR ".join([focus] + rest)


def scrape_platform(platform, query, token, max_items=15, days=90):
    """Runs one actor synchronously and returns its normalized posts."""
    try:
        response = requests.post(
            f"https://api.apify.com/v2/acts/{ACTORS[platform]}/run-sync-get-dataset-items",
            params={"timeout": 90, "format": "json"},
            headers={"Authorization": f"Bearer {token}"},
            json=build_input(platform, query, max_items, days),
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as error:
        raise RuntimeError(f"{platform} could not be reached ({error.__class__.__name__}).") from error

    if response.status_code >= 400:
        raise RuntimeError(f"{platform} scrape failed ({response.status_code}). {response.text[:200]}")

    try:
        items = response.json()
    except ValueError as error:
        raise RuntimeError(f"{platform} returned an unexpected response.") from error

    if not isinstance(items, list):
        raise RuntimeError(f"{platform} returned an unexpected response.")

    return [post for post in (normalize(platform, item) for item in items) if post]


def scrape_all(brand, platforms, token, competitors="", category="", search="", max_items=15, days=90):
    """Returns (posts, warnings) — a failed platform never sinks the whole run."""
    query = build_query(brand, competitors, category, search)
    posts, warnings = [], []
    for platform in platforms:
        try:
            posts.extend(scrape_platform(platform, query, token, max_items=max_items, days=days))
        except RuntimeError as error:
            warnings.append(str(error))
    return posts, warnings, query