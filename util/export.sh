#!/bin/bash

if [ -z "$CLOUDFLARE_TOKEN" ];then
  echo "Need to set CLOUDFLARE_TOKEN" > /dev/stderr
  exit 1
fi

year="$1"
month="$2"

curl "https://hierocles-of-alexandria.methodshub.workers.dev/export?year=$year&month=$month" -H "Authorization: Bearer $CLOUDFLARE_TOKEN" \
  | gzip \
  > export-$year-$month.jsonl.gz

