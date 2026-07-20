# Value Detector Hierocles of Alexandria Cloudflare Worker


## Deployment

Set [Secrets](https://dash.cloudflare.com/543d10d40ca98b5b3d758ea26ee2fd60/workers/services/view/hierocles-of-alexandria/production/settings):

- CF_ACCOUNT_ID
- HF_TOKEN

```{shell}
npx wrangler deploy
```

## Generte API Key

```{shell}
./util/generate-api-key.sh
```


## Save Data

```{shell}
export CLOUDFLARE_TOKEN="TOKEN"
./util/export.sh 2026 07
```

