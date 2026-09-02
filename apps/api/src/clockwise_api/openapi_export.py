"""Dump the FastAPI OpenAPI schema to a file for frontend codegen.

Usage:  uv run python -m clockwise_api.openapi_export <output_path>
Then `openapi-typescript <output_path>` generates the typed TS client.
This is step 1 of the contract-sync flow (`task codegen`).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .main import app


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("openapi.json")
    out.write_text(json.dumps(app.openapi(), indent=2))
    print(f"Wrote OpenAPI schema to {out}")


if __name__ == "__main__":
    main()
