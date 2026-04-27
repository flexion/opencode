#!/bin/bash
# Block .env files from being committed
if git diff --cached --name-only | grep -qE '^\.(env|env\..*)$'; then
  echo "Error: .env files cannot be committed"
  exit 1
fi
