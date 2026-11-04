import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dataProviderForSource, isSupportedDataProvider } from "./data-providers";
import {
  alchemyRpcUrl,
  EVM_CHAINS,
  EVM_CHAIN_IDS,
  etherscanLikeBaseUrl,
  evmChain,
  evmDataset,
  isEvmChain,
} from "./evm-chains";
import { PROVIDER_ICONS } from "./provider-icons";
import { WALLET_PROVIDERS, providerLabel } from "./providers";
import { walletAddressError } from "./wallet-address";
import { explorerUrl, isOnchainProvider } from "./onchain";
import { isBlockchainAccount } from "./foreign-accounts";

const ADDRESS = "0xE62cD3e7b0Afe4D43b03435C737072E77cbF1FB4";

describe("Ethereum — non-régression des curseurs et de l'API", () => {
  it("garde ses ensembles de curseurs d'origine", () => {
    // Renommés, ils feraient relire tout l'historique depuis le bloc 0.
    assert.equal(evmDataset(EVM_CHAINS.ethereum, "native"), "ethereum_native");
    assert.equal(evmDataset(EVM_CHAINS.ethereum, "erc20"), "ethereum_erc20");
  });

  it("interroge toujours Etherscan sur la chaîne 1", () => {
    assert.equal(etherscanLikeBaseUrl(EVM_CHAINS.ethereum), "https://api.etherscan.io/v2/api?chainid=1");
    assert.equal(dataProviderForSource("ethereum"), "etherscan");
  });
});

describe("référentiel des chaînes EVM", () => {
  it("déclare Ethereum, Arbitrum, Base, BNB Smart Chain, Polygon, OP, Avalanche et Linea", () => {
    assert.deepEqual([...EVM_CHAIN_IDS].sort(), ["arbitrum", "avalanche", "base", "bsc", "ethereum", "linea", "optimism", "polygon"]);
  });

  it("porte les identifiants EIP-155 et jetons natifs attendus", () => {
    assert.deepEqual(
      EVM_CHAIN_IDS.map((id) => [id, EVM_CHAINS[id].chainId, EVM_CHAINS[id].nativeSymbol]),
      [
        ["ethereum", 1, "ETH"],
        ["arbitrum", 42161, "ETH"],
        ["base", 8453, "ETH"],
        ["bsc", 56, "BNB"],
        ["polygon", 137, "POL"],
        ["optimism", 10, "ETH"],
        ["avalanche", 43114, "AVAX"],
        ["linea", 59144, "ETH"],
      ]
    );
  });

  it("n'oriente vers Etherscan que les chaînes de son offre gratuite", () => {
    // Base et BSC répondent « Free API access is not supported for this chain ».
    assert.equal(EVM_CHAINS.arbitrum.dataProvider, "etherscan");
    assert.equal(EVM_CHAINS.base.dataProvider, "blockscout");
    assert.equal(EVM_CHAINS.bsc.dataProvider, "alchemy");
  });

  it("construit l'URL de l'indexeur de chaque chaîne", () => {
    assert.equal(etherscanLikeBaseUrl(EVM_CHAINS.arbitrum), "https://api.etherscan.io/v2/api?chainid=42161");
    assert.equal(etherscanLikeBaseUrl(EVM_CHAINS.base), "https://api.blockscout.com/v2/api?chain_id=8453");
    assert.equal(etherscanLikeBaseUrl(EVM_CHAINS.bsc), null);
    assert.equal(alchemyRpcUrl(EVM_CHAINS.bsc, "k3y"), "https://bnb-mainnet.g.alchemy.com/v2/k3y");
    assert.equal(alchemyRpcUrl(EVM_CHAINS.ethereum, "k3y"), null);
  });

  it("isole les curseurs de chaque chaîne", () => {
    const datasets = EVM_CHAIN_IDS.flatMap((id) => [
      evmDataset(EVM_CHAINS[id], "native"),
      evmDataset(EVM_CHAINS[id], "erc20"),
      evmDataset(EVM_CHAINS[id], "in"),
      evmDataset(EVM_CHAINS[id], "out"),
    ]);
    assert.equal(new Set(datasets).size, datasets.length);
  });

  it("reconnaît une chaîne EVM et rejette le reste", () => {
    assert.equal(isEvmChain("base"), true);
    assert.equal(isEvmChain("solana"), false);
    assert.equal(isEvmChain("toString"), false);
    assert.equal(evmChain("bsc")?.label, "BNB Smart Chain");
    assert.equal(evmChain("bitcoin"), null);
  });
});

describe("chaque chaîne EVM est branchée partout", () => {
  for (const id of EVM_CHAIN_IDS) {
    const chain = EVM_CHAINS[id];

    it(`${id} : source wallet connue, avec libellé et icône`, () => {
      assert.ok(WALLET_PROVIDERS.has(id));
      assert.notEqual(providerLabel(id), id);
      assert.ok(PROVIDER_ICONS[id]);
    });

    it(`${id} : reconnue comme réseau on-chain, avec son explorateur`, () => {
      assert.ok(isOnchainProvider(id));
      assert.ok(explorerUrl(id, "0x" + "a".repeat(64))?.startsWith(chain.explorer));
      assert.ok(isBlockchainAccount(id));
    });

    it(`${id} : réclame la clé de son indexeur`, () => {
      assert.equal(dataProviderForSource(id), chain.dataProvider);
      assert.ok(isSupportedDataProvider(chain.dataProvider));
    });

    it(`${id} : accepte une adresse 0x et refuse une adresse d'une autre chaîne`, () => {
      assert.equal(walletAddressError(id, ADDRESS), null);
      assert.notEqual(walletAddressError(id, "bc1qqawl77d0nexhv2sx2vxr50ega65f67qqy35w6r"), null);
      assert.notEqual(walletAddressError(id, "0x1234"), null);
    });
  }
});
