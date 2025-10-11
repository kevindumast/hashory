type Recommendation = {
  title: string;
  insight: string;
};

export type PerformanceSummary = {
  headline: string;
  highlights: string[];
};

export function generatePerformanceSummary(metrics: {
  pnl: number;
  sharpe: number;
  drawdown: number;
}): PerformanceSummary {
  const trend = metrics.pnl >= 0 ? "positive" : "negative";
  const riskText = metrics.drawdown <= -0.1 ? "un drawdown significatif" : "un drawdown controle";
  const efficiencyText = metrics.sharpe >= 1 ? "efficace" : "a optimiser";

  return {
    headline: `Performance ${trend} avec un ratio de Sharpe ${efficiencyText}.`,
    highlights: [
      `P&L realise: ${(metrics.pnl * 100).toFixed(2)} %.`,
      `Ratio de Sharpe: ${metrics.sharpe.toFixed(2)}.`,
      `Gestion du risque: ${riskText}.`,
    ],
  };
}

export function generateRecommendations(metrics: {
  allocation: Record<string, number>;
  volatility: number;
  stablecoinWeight: number;
}): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (metrics.volatility > 0.6) {
    recommendations.push({
      title: "Reduire la volatilite",
      insight: "Reequilibrez vers des actifs moins volatils ou augmentez la poche stablecoin.",
    });
  }

  if (metrics.stablecoinWeight < 0.1) {
    recommendations.push({
      title: "Renforcer les reserves",
      insight: "Augmentez la reserve stablecoin pour amortir les chocs du marche.",
    });
  }

  const overweightAsset = Object.entries(metrics.allocation).find(([, weight]) => weight > 0.4);
  if (overweightAsset) {
    recommendations.push({
      title: "Equilibrer l'exposition",
      insight: `Reduisez votre allocation ${overweightAsset[0]} (actuellement ${(overweightAsset[1] * 100).toFixed(
        1
      )} %) pour diversifier davantage.`,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      title: "All good",
      insight: "La structure actuelle du portefeuille semble coherente avec votre profil de risque.",
    });
  }

  return recommendations;
}
