from fastapi import APIRouter, Query
from fastapi.responses import Response
from collections import OrderedDict
import httpx
import re

router = APIRouter(prefix="/api/proxy", tags=["proxy"])


# Шлюзы IPFS в порядке попытки. Мёртвые (cloudflare-ipfs, nftstorage) убраны.
IPFS_GATEWAYS = [
    "https://{cid}.ipfs.w3s.link{path}",
    "https://w3s.link/ipfs/{cid}{path}",
    "https://ipfs.io/ipfs/{cid}{path}",
    "https://{cid}.ipfs.dweb.link{path}",
    "https://dweb.link/ipfs/{cid}{path}",
    "https://gateway.pinata.cloud/ipfs/{cid}{path}",
    "https://ipfs.near.social/ipfs/{cid}{path}",
]

# Память: какой шаблон шлюза реально сработал для CID — пробуем его первым.
_working_gw = {}

# LRU-кэш байтов картинок: под 1000 онлайн снимает повторные загрузки.
_IMG_CACHE_MAX = 250
_img_cache = OrderedDict()


def _cache_get(key):
    val = _img_cache.get(key)
    if val is not None:
        _img_cache.move_to_end(key)
    return val


def _cache_put(key, content, content_type):
    if len(content) > 3 * 1024 * 1024:
        return
    _img_cache[key] = (content, content_type)
    _img_cache.move_to_end(key)
    while len(_img_cache) > _IMG_CACHE_MAX:
        _img_cache.popitem(last=False)


def parse_ipfs_url(url):
    if not url:
        return None, None
    if url.startswith("ipfs://"):
        rest = url[7:]
        idx = rest.find("/")
        if idx >= 0:
            return rest[:idx], rest[idx:]
        return rest, ""
    m = re.match(r"https?://([a-zA-Z0-9]{20,})\.ipfs\.[^/]+(/.*)?\s*$", url)
    if m:
        return m.group(1), m.group(2) or ""
    m = re.search(r"/ipfs/([a-zA-Z0-9]{20,})(/.*)?\s*$", url)
    if m:
        return m.group(1), m.group(2) or ""
    return None, None


_TRANSPARENT_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@router.get("/image")
async def proxy_image(url: str = Query(..., description="Original image URL")):
    cached = _cache_get(url)
    if cached is not None:
        content, content_type = cached
        return Response(
            content=content,
            media_type=content_type,
            headers={
                "Cache-Control": "public, max-age=604800",
                "Access-Control-Allow-Origin": "*",
            },
        )

    cid, path = parse_ipfs_url(url)

    urls_to_try = [url]
    if cid:
        tmpl = _working_gw.get(cid)
        if tmpl:
            cand = tmpl.format(cid=cid, path=path or "")
            if cand not in urls_to_try:
                urls_to_try.insert(0, cand)
        for gw in IPFS_GATEWAYS:
            candidate = gw.format(cid=cid, path=path or "")
            if candidate not in urls_to_try:
                urls_to_try.append(candidate)

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://near.org/",
    }

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        for attempt_url in urls_to_try:
            try:
                resp = await client.get(attempt_url, headers=headers)
                if resp.status_code == 200:
                    content_type = resp.headers.get("content-type", "image/png")
                    if "image" in content_type or "octet-stream" in content_type:
                        if cid:
                            for gw in IPFS_GATEWAYS:
                                if gw.format(cid=cid, path=path or "") == attempt_url:
                                    _working_gw[cid] = gw
                                    break
                        _cache_put(url, resp.content, content_type)
                        return Response(
                            content=resp.content,
                            media_type=content_type,
                            headers={
                                "Cache-Control": "public, max-age=604800",
                                "Access-Control-Allow-Origin": "*",
                            },
                        )
            except Exception:
                continue

    return Response(content=_TRANSPARENT_PNG, media_type="image/png", status_code=200)
