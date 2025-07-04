// hooks/useCommissionPercent.ts
import { useReadContract } from 'wagmi';
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '@/lib/contractConfig';

export function useCommissionPercent() {
  return useReadContract({
    abi: CONTRACT_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'commissionPercent',
  });
}
