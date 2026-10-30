import Dexie, { type EntityTable } from 'dexie';

export type Product = { id?: number; barcode: string; name: string; unit: 'pcs' | 'kg' | 'g' | 'l'; price: number; cost: number; stock: number; updatedAt: string };
export type Sale = { id?: number; receiptNo: string; items: { productId: number; barcode: string; name: string; qty: number; price: number; cost: number }[]; total: number; paid: number; change: number; createdAt: string; fiscalStatus: 'not_fiscalized' };
export type StockMove = { id?: number; productId: number; kind: 'purchase' | 'writeoff' | 'sale' | 'adjustment'; qty: number; unitCost: number; note: string; createdAt: string };
export type Expense = { id?: number; category: string; amount: number; note: string; createdAt: string };

class StoreDB extends Dexie {
  products!: EntityTable<Product, 'id'>;
  sales!: EntityTable<Sale, 'id'>;
  stockMoves!: EntityTable<StockMove, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  constructor() {
    super('StorePOS');
    this.version(1).stores({
      products: '++id, &barcode, name, updatedAt',
      sales: '++id, &receiptNo, createdAt',
      stockMoves: '++id, productId, kind, createdAt',
      expenses: '++id, category, createdAt'
    });
    this.version(2).stores({
      products: '++id, &barcode, name, unit, updatedAt',
      sales: '++id, &receiptNo, createdAt',
      stockMoves: '++id, productId, kind, createdAt',
      expenses: '++id, category, createdAt'
    }).upgrade(async tx => {
      await tx.table('products').toCollection().modify((product: Product) => { if (!product.unit) product.unit = 'pcs'; });
    });
  }
}
export const db = new StoreDB();
export const money = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' сум';
