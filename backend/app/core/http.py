"""Shared HTTPS settings for outgoing requests (urllib).

Python from the python.org macOS installer ships without a CA certificate bundle, so HTTPS calls fail with
CERTIFICATE_VERIFY_FAILED. Use certifi's bundle if installed, else the operating system's, else Python's default.
"""
import os
import ssl


def _context() -> ssl.SSLContext:
    try:
        import certifi  # type: ignore

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        pass
    for path in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt", "/etc/pki/tls/certs/ca-bundle.crt"):
        if os.path.exists(path):
            return ssl.create_default_context(cafile=path)
    return ssl.create_default_context()


SSL_CONTEXT = _context()
