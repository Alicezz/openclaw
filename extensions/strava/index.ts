import type { IncomingMessage, ServerResponse } from "node:http";
import * as path from "node:path";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { TokenStore, exchangeCode, buildAuthUrl } from "./src/oauth.js";
import { createStravaTools } from "./src/tools.js";
import type { StravaConfig } from "./src/types.js";

const OAUTH_CALLBACK_PATH = "/api/plugins/strava/oauth/callback";
const OAUTH_START_PATH = "/api/plugins/strava/oauth/start";
const DEFAULT_GATEWAY_PORT = 18789;

const stravaPlugin = {
  id: "strava",
  name: "Strava",
  description:
    "Connect your Strava account to let the AI agent read your running activities and act as a coach.",
  register(api: OpenClawPluginApi) {
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
    const clientId = pluginConfig.clientId as string | undefined;
    const clientSecret = pluginConfig.clientSecret as string | undefined;

    if (!clientId || !clientSecret) {
      api.logger.warn(
        "strava: plugin not activated — set plugins.strava.clientId and plugins.strava.clientSecret in your config. " +
          "Create a Strava API app at https://www.strava.com/settings/api",
      );
      return;
    }

    const config: StravaConfig = { clientId, clientSecret };
    const gatewayPort = (api.config.gateway?.port as number | undefined) ?? DEFAULT_GATEWAY_PORT;

    // Use a strava subdirectory under the main state dir for token storage.
    const stateDir = path.join(api.runtime.state.resolveStateDir(), "strava");
    const tokenStore = new TokenStore(stateDir);

    const getRedirectUri = () => `http://localhost:${gatewayPort}${OAUTH_CALLBACK_PATH}`;

    // Register the 4 Strava tools.
    const tools = createStravaTools({ config, tokenStore, getRedirectUri });
    for (const tool of tools) {
      api.registerTool(tool as AnyAgentTool, { optional: true });
    }

    // OAuth callback — receives the redirect from Strava after user authorizes.
    api.registerHttpRoute({
      path: OAUTH_CALLBACK_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url!, `http://${req.headers.host}`);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/html");
            res.end(
              htmlPage(
                "Authorization Denied",
                "You denied the Strava authorization request. You can close this tab.",
              ),
            );
            return;
          }

          if (!code) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/html");
            res.end(htmlPage("Missing Code", "No authorization code received from Strava."));
            return;
          }

          const tokens = await exchangeCode(config, code);
          tokenStore.save(tokens);

          api.logger.info(`strava: connected athlete ${tokens.athleteId}`);

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html");
          res.end(
            htmlPage(
              "Strava Connected!",
              "Your Strava account is now linked. You can close this tab and ask your AI assistant about your runs.",
            ),
          );
        } catch (err) {
          api.logger.error(`strava: OAuth callback error: ${err}`);
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/html");
          res.end(
            htmlPage(
              "Connection Failed",
              "Something went wrong connecting to Strava. Check the gateway logs.",
            ),
          );
        }
      },
    });

    // Convenience redirect — visiting this URL starts the OAuth flow.
    api.registerHttpRoute({
      path: OAUTH_START_PATH,
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const authUrl = buildAuthUrl(clientId, getRedirectUri());
        res.statusCode = 302;
        res.setHeader("Location", authUrl);
        res.end();
      },
    });

    api.logger.info("strava: plugin activated");
  },
};

function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{background:#fff;border-radius:12px;padding:2rem;max-width:400px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.1)}
h1{font-size:1.5rem;margin:0 0 1rem}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

export default stravaPlugin;
