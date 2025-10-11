type Series = number[];

function mean(values: Series) {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function variance(values: Series, meanValue: number) {
  if (values.length === 0) {
    return 0;
  }
  const squared = values.map((value) => {
    const diff = value - meanValue;
    return diff * diff;
  });
  return mean(squared);
}

export function sharpeRatio(returns: Series, riskFreeRate = 0) {
  if (returns.length <= 1) {
    return 0;
  }
  const adjustedReturns = returns.map((value) => value - riskFreeRate);
  const avg = mean(adjustedReturns);
  const stdDev = Math.sqrt(variance(adjustedReturns, avg));
  return stdDev === 0 ? 0 : avg / stdDev;
}

export function alphaBeta(assetReturns: Series, benchmarkReturns: Series) {
  if (assetReturns.length !== benchmarkReturns.length || assetReturns.length === 0) {
    return { alpha: 0, beta: 0 };
  }

  const assetMean = mean(assetReturns);
  const benchmarkMean = mean(benchmarkReturns);

  let covariance = 0;
  let benchmarkVariance = 0;

  for (let index = 0; index < assetReturns.length; index += 1) {
    const assetDiff = assetReturns[index] - assetMean;
    const benchmarkDiff = benchmarkReturns[index] - benchmarkMean;
    covariance += assetDiff * benchmarkDiff;
    benchmarkVariance += benchmarkDiff * benchmarkDiff;
  }

  if (benchmarkVariance === 0) {
    return { alpha: 0, beta: 0 };
  }

  const beta = covariance / benchmarkVariance;
  const alpha = assetMean - beta * benchmarkMean;

  return { alpha, beta };
}

export function maxDrawdown(values: Series) {
  if (values.length === 0) {
    return 0;
  }

  let peak = values[0];
  let drawdown = 0;

  values.forEach((value) => {
    peak = Math.max(peak, value);
    const currentDrawdown = peak === 0 ? 0 : (value - peak) / peak;
    drawdown = Math.min(drawdown, currentDrawdown);
  });

  return drawdown;
}

export function cumulativeReturn(values: Series) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((accumulator, current) => accumulator * (1 + current), 1) - 1;
}
