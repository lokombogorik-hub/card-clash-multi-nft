from fastapi import APIRouter, Query
from fastapi.responses import Response
import httpx
import re

router = APIRouter(prefix="/api/proxy", tags=["proxy"])


IPFS_GATEWAYS = [
    "https://{cid}.ipfs.w3s.link{path}",
    "https://w3s.link/ipfs/{cid}{path}",
    "https://{cid}.ipfs.dweb.link{path}",
    "https://dweb.link/ipfs/{cid}{path}",
    "https://ipfs.io/ipfs/{cid}{path}",
    "https://gateway.pinata.cloud/ipfs/{cid}{path}",
    "https://nftstorage.link/ipfs/{cid}{path}",
    "https://ipfs.near.social/ipfs/{cid}{path}",
    "https://cloudflare-ipfs.com/ipfs/{cid}{path}",
]


def parse_ipfs_url(url: str):
    """Extract CID and path from various IPFS URL formats."""
    if not url:
        return None, None

    # ipfs
    if url.startswith("ipfs://"):
        rest = url[7:]
        idx = rest.find("/")
        if idx >= 0:
            return rest[:idx], rest[idx:]
        return rest, ""

    #  https://CID.ipfs.gateway/path
    m = re.match(r"https?://([a-zA-Z0-9]{20,})\.ipfs\.[^/]+(/.*)?\s*$", url)
    if m:
        return m.group(1), m.group(2) or ""

    #  https://gateway/ipfs/CID/path
    m = re.search(r"/ipfs/([a-zA-Z0-9]{20,})(/.*)?\s*$", url)
    if m:
        return m.group(1), m.group(2) or ""

    return None, None


@router.get("/image")
async def proxy_image(url: str = Query(..., description="Original image URL")):
    """
    Proxy an image URL. Tries original URL first, then alternative IPFS gateways.
    """
    cid, path = parse_ipfs_url(url)

    urls_to_try = []


    urls_to_try.append(url)


    if cid:
        for gw in IPFS_GATEWAYS:
            candidate = gw.format(cid=cid, path=path or "")
            if candidate != url and candidate not in urls_to_try:
                urls_to_try.append(candidate)

    async with httpx.AsyncClient(follow_redirects=True, timeout=20.0) as client:
        for attempt_url in urls_to_try:
            try:
                resp = await client.get(attempt_url, headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                    "Referer": "https://near.org/",
                })
                if resp.status_code == 200:
                    content_type = resp.headers.get("content-type", "image/png")

                    if "image" in content_type or "octet-stream" in content_type:
                        return Response(
                            content=resp.content,
                            media_type=content_type,
                            headers={
                                "Cache-Control": "public, max-age=86400",
                                "Access-Control-Allow-Origin": "*",
                            },
                        )
            except Exception:
                continue


    transparent_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
        b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return Response(content=transparent_png, media_type="image/png", status_code=200)