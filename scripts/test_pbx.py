#!/usr/bin/env python3
"""Simulate a Yeastar PBX call through the webhook endpoint.

Usage:
  python3 test_pbx.py                          # defaults
  python3 test_pbx.py 0722111222 0800720999    # custom caller / callee
"""
import urllib.request
import json
import time
import os
import sys
from datetime import datetime

URL = "http://localhost:3000/pbx/webhook"
SECRET = os.environ.get("YEASTAR_WEBHOOK_SECRET", "V0R5joSuCAF1uMWcvQqHK1CXcTbLeBfg")

CALLER = input("Caller number (press Enter for 0722111222): ").strip() or "0722111222"
CALLEE = input("Callee number (press Enter for 0800720999): ").strip() or "0800720999"
CALL_ID = f"sim-{int(time.time())}"
NOW = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def post(payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Yeastar-Secret": SECRET,
        },
    )
    res = urllib.request.urlopen(req)
    print(" →", res.read().decode())


print(f"Simulating call: {CALLER} → {CALLEE}  (callid={CALL_ID}, time={NOW})")
print()

print("Step 1: Ringing (check Call Logs page for active call banner)")
post({
    "event": "CallStatus",
    "callid": CALL_ID,
    "callfrom": CALLER,
    "callto": CALLEE,
    "callstatus": "Ringing",
    "calltype": "Inbound",
})
time.sleep(3)

print("Step 2: Answered")
post({
    "event": "CallStatus",
    "callid": CALL_ID,
    "callfrom": CALLER,
    "callto": CALLEE,
    "callstatus": "Talking",
    "calltype": "Inbound",
})
time.sleep(3)

print("Step 3: Call ended - CDR saved to database")
post({
    "event": "NewCdr",
    "callid": CALL_ID,
    "timestart": NOW,
    "callfrom": CALLER,
    "callto": CALLEE,
    "callduraction": 45,
    "talkduraction": 38,
    "srctrunkname": "SIP-Trunk-1",
    "didnumber": CALLEE,
    "status": "ANSWERED",
    "type": "Inbound",
})

print("Done - check Call Logs page, the record should appear in the table.")
