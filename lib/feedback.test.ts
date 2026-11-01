import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { feedbackError, feedbackIssue, feedbackPage } from "./feedback";

const base = { id: "f1", userId: "user_1", page: "/dashboard", userAgent: "Firefox" };

describe("issue GitHub d'un retour", () => {
  it("préfixe le titre et pose les labels selon le type", () => {
    const bug = feedbackIssue({ ...base, kind: "bug", title: "Crash", body: "Détails" });
    assert.equal(bug.title, "[Bug] Crash");
    assert.deepEqual(bug.labels, ["bug", "retour utilisateur"]);
    const idee = feedbackIssue({ ...base, kind: "idee", title: "Export", body: "Détails" });
    assert.deepEqual(idee.labels, ["enhancement", "retour utilisateur"]);
  });

  it("désamorce les @mentions et n'expose que l'identifiant du compte", () => {
    const issue = feedbackIssue({ ...base, kind: "bug", title: "Voir @octocat", body: "cc @octocat, écrire à moi@exemple.fr" });
    assert.doesNotMatch(issue.title, /@octocat/);
    assert.doesNotMatch(issue.body, /@octocat/);
    assert.match(issue.body, /`\/dashboard`/);
    assert.match(issue.body, /`user_1`/);
  });
});

describe("validation d'un retour", () => {
  it("refuse un type inconnu ou un retour trop court", () => {
    assert.notEqual(feedbackError({ kind: "spam", title: "Titre", body: "Assez de détails" }), null);
    assert.notEqual(feedbackError({ kind: "bug", title: "ok", body: "Assez de détails" }), null);
    assert.notEqual(feedbackError({ kind: "bug", title: "Titre", body: "court" }), null);
    assert.equal(feedbackError({ kind: "idee", title: "Mode sombre", body: "Ce serait top" }), null);
  });

  it("ne garde qu'un chemin interne comme page", () => {
    assert.equal(feedbackPage("/dashboard/tax-report"), "/dashboard/tax-report");
    assert.equal(feedbackPage("https://ailleurs.fr"), null);
    assert.equal(feedbackPage("//ailleurs.fr"), null);
    assert.equal(feedbackPage(undefined), null);
  });
});
