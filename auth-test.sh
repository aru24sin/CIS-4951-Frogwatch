#!/usr/bin/env bash
set -euo pipefail

BASE="http://127.0.0.1:8000"
LOGIN_JSON="/tmp/login.json"
TOKEN_FILE="/tmp/idToken.txt"
ME_JSON="/tmp/me.json"

EMAIL="ahmed+test1@gmail.com"
PASSWORD="MyTestP@ssw0rd!"

# urlsafe Base64 decode (handles missing padding)
b64url_decode() {
  local input="$1"
  local rem=$(( ${#input} % 4 ))
  if   [ $rem -eq 2 ]; then input="${input}=="
  elif [ $rem -eq 3 ]; then input="${input}="
  elif [ $rem -eq 1 ]; then input="${input}A==="; fi
  echo "$input" | tr '_-' '/+' | base64 -D 2>/dev/null
}

token_remaining_secs() {
  local token="$1"
  local payload
  payload="$(b64url_decode "$(echo "$token" | cut -d. -f2)")" || return 1
  local exp
  exp="$(echo "$payload" | jq -r '.exp')" || return 1
  local now
  now="$(date -u +%s)"
  echo $(( exp - now ))
}

login_and_save() {
  echo "1) Logging in as ${EMAIL} ..."
  curl -s -X POST "$BASE/auth/login" \
    -H "content-type: application/json" \
    -d "{ \"email\": \"${EMAIL}\", \"password\": \"${PASSWORD}\" }" \
    > "$LOGIN_JSON"

  jq -r '.idToken' "$LOGIN_JSON" > "$TOKEN_FILE"
  echo "   Saved idToken to ${TOKEN_FILE}"
}

ensure_fresh_token() {
  if [[ ! -s "$TOKEN_FILE" ]]; then
    echo "No token found. Logging in..."
    login_and_save
    return
  fi

  local token
  token="$(cat "$TOKEN_FILE")"
  local remain
  if ! remain="$(token_remaining_secs "$token" 2>/dev/null)"; then
    echo "Couldn't parse token. Re-logging in..."
    login_and_save
    return
  fi

  if (( remain <= 0 )); then
    echo "Token expired. Re-logging in..."
    login_and_save
  else
    local mins=$(( remain / 60 ))
    echo "Token still valid (~${mins} min left)."
  fi
}

# ---- run ----
ensure_fresh_token

echo
echo "2) Calling /auth/me ..."
curl -s -X GET "$BASE/auth/me" \
  -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
  -H "accept: application/json" | tee "$ME_JSON"
echo
echo
echo "Done. (${LOGIN_JSON} and ${ME_JSON} saved)"

