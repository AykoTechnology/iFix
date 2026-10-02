import type { Meta, StoryObj } from "@storybook/react-vite";
import { Botao } from "./Botao.js";

const meta = {
  title: "Ações/Botao",
  component: Botao,
  args: { children: "Continuar" },
} satisfies Meta<typeof Botao>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primario: Story = { args: { variante: "primario" } };
export const Secundario: Story = { args: { variante: "secundario", children: "Voltar" } };
export const Terciario: Story = { args: { variante: "terciario", children: "Cancelar" } };
export const Desabilitado: Story = { args: { desabilitado: true } };

/**
 * Todas as variantes lado a lado — a história que revela uma variante fora do padrão
 * de alvo ou de foco, que passaria despercebida isolada na própria página.
 */
export const TodasAsVariantes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2 bg-surface p-4">
      <Botao variante="primario">Continuar</Botao>
      <Botao variante="secundario">Voltar</Botao>
      <Botao variante="terciario">Cancelar</Botao>
      <Botao desabilitado>Indisponível</Botao>
    </div>
  ),
};
