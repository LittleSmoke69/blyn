export function ComingSoon({ title }: { title: string }) {
  return (
    <div>
      <h1 className="text-2xl mb-1">{title}</h1>
      <p className="text-muted mb-8">Essa tela ainda não foi construída.</p>
      <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center text-muted">
        Em construção — faz parte do catálogo de 16 telas, mas ainda não entrou no escopo implementado.
      </div>
    </div>
  );
}
