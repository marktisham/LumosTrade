
export class Position {
    Symbol: string;
    Quantity: number;
    Price: number;

    constructor(symbol: string, quantity: number, price: number) {
        this.Symbol = symbol;
        this.Quantity = quantity;
        this.Price = price;
    }

    /**
     * Group a list of positions by symbol.
     */
    public static MapSymbolToPositions(positions: Position[] | null | undefined): Record<string, Position[]> {
        const out: Record<string, Position[]> = {};
        if (!positions || positions.length === 0) return out;

        for (const p of positions) {
            const sym = (p?.Symbol ?? '').toString();
            if (!sym) continue;
            if (!out[sym]) out[sym] = [];
            out[sym].push(p);
        }
        return out;
    }
}
