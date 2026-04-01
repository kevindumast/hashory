"use client";

import { useState } from "react";
import { FileText, Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TaxReportView() {
  const [year, setYear] = useState(new Date().getFullYear());

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Déclaration fiscale</h1>
          <p className="text-muted-foreground">
            Générez vos rapports fiscaux pour vos transactions de cryptomonnaies
          </p>
        </div>

        {/* Filter Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <label className="text-sm font-medium">Année:</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-input rounded-md text-sm"
            >
              {[2020, 2021, 2022, 2023, 2024, 2025].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Empty State */}
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <h2 className="text-lg font-semibold mb-2">Aucune déclaration disponible</h2>
          <p className="text-muted-foreground mb-4">
            Veuillez connecter un compte d&apos;échange pour générer votre déclaration fiscale.
          </p>
          <Button>
            <Download className="w-4 h-4 mr-2" />
            Générer un rapport
          </Button>
        </div>

        {/* Info Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2">À propos des rapports fiscaux</h3>
          <p className="text-sm text-muted-foreground">
            Les rapports fiscaux sont générés en fonction de vos transactions de cryptomonnaies.
            Les données incluent les gains/pertes en capital, les frais et autres informations
            nécessaires pour votre déclaration fiscale.
          </p>
        </div>
      </div>
    </div>
  );
}
