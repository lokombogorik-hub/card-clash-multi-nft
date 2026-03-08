from fastapi import APIRouter, Query
from fastapi.responses import Response
import httpx

router = APIRouter(prefix="/api/proxy", tags=["proxy"])

ALLOWED_HOSTS = [
    "ipfs.near.social",
    "cloudflare-ipfs.com",
    "nftstorage.link",
    "ipfs.io",
    "w3s.link",
    "gateway.pinata.cloud",
    "arweave.net",
    "dweb.link",
]

IPFS_GATEWAYS = [
    "https://ipfs.near.social/ipfs/{cid}{path}",
    "https://cloudflare-ipfs.com/ipfs/{cid}{path}",
    "https://nftstorage.link/ipfs/{cid}{path}",
    "https://ipfs.io/ipfs/{cid}{path}",
    "https://w3s.link/ipfs/{cid}{path}",
]

import re

def parse_ipfs_url(url: str):
    """Extract CID and path from various IPFS URL formats."""
    if not url:
        return None, None

    # ipfs:// protocol
    if url.startswith("ipfs://"):
        rest = url[7:]
        idx = rest.find("/")
        if idx >= 0:
            return rest[:idx], rest[idx:]
        return rest, ""

    # subdomain: https://CID.ipfs.gateway/path
    m = re.match(r"https?://([a-zA-Z0-9]{20,})\.ipfs\.[^/]+(/.*)?\s*$", url)
    if m:
        return m.group(1), m.group(2) or ""

    # path-based: https://gateway/ipfs/CID/path
    m = re.search(r"/ipfs/([a-zA-Z0-9]{20,})(/.*)?\s*$", url)
    if m:
        return m.group(1), m.group(2) or ""

    return None, None


@router.get("/image")
async def proxy_image(url: str = Query(..., description="Original image URL")):
    """
    Proxy an image URL. If it's an IPFS URL and the original gateway fails,
    automatically try alternative gateways.
    """
    cid, path = parse_ipfs_url(url)

    urls_to_try = []

    if cid:
        # Build list of gateway URLs to try
        for gw in IPFS_GATEWAYS:
            urls_to_try.append(gw.format(cid=cid, path=path or ""))
    else:
        urls_to_try.append(url)

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        for attempt_url in urls_to_try:
            try:
                resp = await client.get(attempt_url, headers={
                    "User-Agent": "CardClash-Proxy/1.0",
                    "Accept": "image/*,*/*",
                })
                if resp.status_code == 200:
                    content_type = resp.headers.get("content-type", "image/png")
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

    # All failed — return 1x1 transparent PNG
    transparent_png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
        b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return Response(content=transparent_png, media_type="image/png", status_code=200)