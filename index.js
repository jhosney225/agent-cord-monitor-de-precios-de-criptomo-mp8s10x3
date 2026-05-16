
```javascript
import Anthropic from "@anthropic-ai/sdk";
import https from "https";

const client = new Anthropic();

// Store for price alerts and current prices
const priceAlerts = {};
const currentPrices = {};

// Function to fetch crypto prices from CoinGecko API
async function fetchCryptoPrices(cryptoIds) {
  return new Promise((resolve, reject) => {
    const ids = cryptoIds.join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`;

    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const prices = JSON.parse(data);
          resolve(prices);
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

// Define tools for the assistant
const tools = [
  {
    name: "get_current_prices",
    description:
      "Get current prices of cryptocurrencies. Returns the current USD price and market data for specified cryptocurrencies.",
    input_schema: {
      type: "object",
      properties: {
        cryptocurrencies: {
          type: "array",
          items: {
            type: "string",
          },
          description:
            "List of cryptocurrency IDs to get prices for (e.g., ['bitcoin', 'ethereum', 'cardano'])",
        },
      },
      required: ["cryptocurrencies"],
    },
  },
  {
    name: "set_price_alert",
    description:
      "Set a price alert for a cryptocurrency. Will alert when price goes above or below the specified threshold.",
    input_schema: {
      type: "object",
      properties: {
        cryptocurrency: {
          type: "string",
          description: "The cryptocurrency ID (e.g., 'bitcoin', 'ethereum')",
        },
        threshold_price: {
          type: "number",
          description: "The price threshold for the alert in USD",
        },
        alert_type: {
          type: "string",
          enum: ["above", "below"],
          description: "Alert when price goes above or below the threshold",
        },
      },
      required: ["cryptocurrency", "threshold_price", "alert_type"],
    },
  },
  {
    name: "check_alerts",
    description:
      "Check if any price alerts have been triggered based on current prices",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_alerts",
    description: "List all active price alerts",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Process tool calls
async function processToolCall(toolName, toolInput) {
  switch (toolName) {
    case "get_current_prices": {
      const prices = await fetchCryptoPrices(toolInput.cryptocurrencies);
      // Store prices for later alert checking
      Object.assign(currentPrices, prices);
      const formattedPrices = {};
      for (const [crypto, data] of Object.entries(prices)) {
        if (data.usd) {
          formattedPrices[crypto] = {
            price: `$${data.usd}`,
            market_cap: data.usd_market_cap
              ? `$${(data.usd_market_cap / 1e9).toFixed(2)}B`
              : "N/A",
            volume_24h: data.usd_24h_vol
              ? `$${(data.usd_24h_vol / 1e9).toFixed(2)}B`
              : "N/A",
          };
        }
      }
      return JSON.stringify(formattedPrices);
    }

    case "set_price_alert": {
      const key = `${toolInput.cryptocurrency}_${toolInput.alert_type}`;
      priceAlerts[key] = {
        cryptocurrency: toolInput.cryptocurrency,
        threshold_price: toolInput.threshold_price,
        alert_type: toolInput.alert_type,
        created_at: new Date().toISOString(),
      };
      return JSON.stringify({
        success: true,
        message: `Alert set for ${toolInput.cryptocurrency}: notify when price goes ${toolInput.alert_type} $${toolInput.threshold_price}`,
      });
    }

    case "check_alerts": {
      const triggeredAlerts = [];
      for (const [key, alert] of Object.entries(priceAlerts)) {
        const cryptoData = currentPrices[alert.cryptocurrency];
        if (cryptoData && cryptoData.usd) {
          const currentPrice = cryptoData.usd;
          const isTriggered =
            (alert.alert_type === "above" &&
              currentPrice > alert.threshold_price) ||
            (alert.alert_type === "below" &&
              currentPrice < alert.threshold_price);

          if (isTriggered) {
            triggeredAlerts.push({
              cryptocurrency: alert.cryptocurrency,
              current_price: `$${currentPrice}`,
              threshold: `$${alert.threshold_price}`,
              alert_type: alert.alert_type,
              message: `ALERT: ${alert.cryptocurrency.toUpperCase()} price is now $${currentPrice}, which is ${alert.alert_type} your threshold of $${alert.threshold_price}`,
            });
          }
        }
      }
      return JSON.stringify({
        alerts_triggered: triggeredAlerts.length > 0,
        triggered_alerts: triggeredAlerts,
      });
    }

    case "list_alerts": {
      const alertsList = Object.values(priceAlerts).map((