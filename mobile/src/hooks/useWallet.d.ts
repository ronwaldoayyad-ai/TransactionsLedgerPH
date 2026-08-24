export function useWallet(): {
  cards: any[]
  accounts: any[]
  bills: any[]
  payments: any[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  addCard: (input: any) => Promise<any>
  updateCard: (id: string, patch: any) => Promise<any>
  deleteCard: (id: string) => Promise<void>
  addAccount: (input: any) => Promise<any>
  updateAccount: (id: string, patch: any) => Promise<any>
  deleteAccount: (id: string) => Promise<void>
  addBill: (input: any) => Promise<any>
  deleteBill: (id: string) => Promise<void>
  payBill: (billId: string, input: any) => Promise<any>
  deletePayment: (id: string) => Promise<void>
  addAccountTxn: (input: any) => Promise<any>
}
