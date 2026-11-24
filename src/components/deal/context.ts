import { createContext, useContext } from 'react'
import type { Deal } from '@/domain/types'

export const DealDialogContext = createContext<{ newDeal: (preset?: { customerId?: string }) => void; correctDeal: (d: Deal) => void }>({ newDeal: () => {}, correctDeal: () => {} })
/** Open the New deal / Correct deal dialog from anywhere. */
export const useDealDialog = () => useContext(DealDialogContext)
