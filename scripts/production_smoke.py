"""Explicit production connectivity check; never print credentials or tokens."""
import os
from uuid import uuid4

import boto3
import psycopg2
import requests

from import_local_stores import database_url


def main():
    with psycopg2.connect(database_url(True), connect_timeout=15) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM projects")
            assert cur.fetchone()[0] == 4116, "Unexpected store count"
    print("PASS: 4116 production store cards", flush=True)

    base = "http://okur-erp-web:3000"
    with requests.Session() as session:
        response = session.post(base + "/api/v1/auth/login", data={
            "username": os.environ["PLATFORM_ADMIN_EMAIL"],
            "password": os.environ["PLATFORM_ADMIN_PASSWORD"],
        }, timeout=45)
        assert response.status_code == 200, f"Login failed: HTTP {response.status_code}"
        token = response.json()["access_token"]
        response = session.get(base + "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
        assert response.status_code == 200, f"Authenticated request failed: HTTP {response.status_code}"
    print("PASS: frontend proxy, admin login and authenticated API", flush=True)

    s3 = boto3.client("s3", endpoint_url=os.environ["OCI_ENDPOINT"], region_name="auto")
    bucket = os.environ["OCI_BUCKET_NAME"]
    key = f"deployment-checks/{uuid4()}.txt"
    payload = b"OKUR ERP deployment connectivity check"
    try:
        s3.put_object(Bucket=bucket, Key=key, Body=payload)
        assert s3.get_object(Bucket=bucket, Key=key)["Body"].read() == payload
    finally:
        s3.delete_object(Bucket=bucket, Key=key)
    print("PASS: private R2 write/read and test-file cleanup", flush=True)


if __name__ == "__main__":
    main()
