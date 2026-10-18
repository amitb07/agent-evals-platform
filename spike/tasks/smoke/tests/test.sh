#!/bin/sh
mkdir -p /logs/verifier
if [ "$(cat /app/hello.txt 2>/dev/null)" = "Hello, Hermes!" ]; then
  echo 1 > /logs/verifier/reward.txt
else
  echo 0 > /logs/verifier/reward.txt
fi
ls -la /app > /logs/verifier/app-listing.txt 2>&1
