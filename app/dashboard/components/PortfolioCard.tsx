import { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PortfolioCardProps = {
  title: string;
  value: string;
  description?: string;
  accent?: ReactNode;
};

export function PortfolioCard({ title, value, description, accent }: PortfolioCardProps) {
  return (
    <Card className="border-border bg-card/80 shadow-sm backdrop-blur">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base text-muted-foreground">{title}</CardTitle>
          {description ? (
            <CardDescription className="mt-1 text-sm text-muted-foreground/80">{description}</CardDescription>
          ) : null}
        </div>
        {accent}
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
