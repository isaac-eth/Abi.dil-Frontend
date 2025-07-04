
'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { CONTRACT_ABI, CONTRACT_ADDRESS, TOKEN_ADDRESSES } from '@/lib/contractConfig';
import { useAccount, useWriteContract, useReadContract } from 'wagmi';
import { parseUnits } from 'viem/utils';
import { erc20Abi } from '@/lib/erc20abi';
import { writeContract, waitForTransactionReceipt, readContract } from 'viem/actions';
import { createPublicClient, http } from 'viem';
import { arbitrum } from 'viem/chains';
import { client } from '@/lib/viemClient';

export default function DappHomePage() {
  const [selectedToken, setSelectedToken] = useState('MXNB');
  const [payDealId, setPayDealId] = useState('');
  const [releaseDealId, setReleaseDealId] = useState('');
  const [dealCost, setDealCost] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [walletInput, setWalletInput] = useState('');
  const [createdDealIds, setCreatedDealIds] = useState<bigint[]>([]);
  const [createdDealsWallet, setCreatedDealsWallet] = useState('');
  const [showDeals, setShowDeals] = useState(false);
  const [dealDetailId, setDealDetailId] = useState('');
  const [dealDetails, setDealDetails] = useState<any | null>(null);


  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(),
  });

  const { data: commissionPercentData } = useReadContract({
    abi: CONTRACT_ABI,
    address: CONTRACT_ADDRESS,
    functionName: 'commissionPercent',
  });

  const handleCreateDeal = async () => {
  if (!isConnected || !address) {
    alert('Conecta tu wallet');
    return;
  }

  if (!dealCost || isNaN(Number(dealCost))) {
    alert('Ingresa un costo válido');
    return;
  }

  try {
    const tokenAddress = TOKEN_ADDRESSES[selectedToken as keyof typeof TOKEN_ADDRESSES];
    const formattedCost = parseUnits(dealCost, 6);
    const commissionRate = commissionPercentData ? BigInt(Number(commissionPercentData)) : 0n;
    const fullCommission = (formattedCost * commissionRate) / 10000n;
    const halfCommission = fullCommission / 2n;

    const currentAllowance = await readContract(publicClient, {
      abi: erc20Abi,
      address: tokenAddress as `0x${string}`,
      functionName: 'allowance',
      args: [address as `0x${string}`, CONTRACT_ADDRESS as `0x${string}`],
    });

    if ((currentAllowance as bigint) < halfCommission) {
      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: tokenAddress as `0x${string}`,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, halfCommission],
      });

      await waitForTransactionReceipt(publicClient, { hash });
    }

    // Crear trato
    const hash = await writeContractAsync({
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'createDeal',
      args: [tokenAddress, formattedCost],
    });

    const receipt = await waitForTransactionReceipt(publicClient, { hash });
      console.log('LOGS DE RECEIPT:', receipt.logs);

    // Hash correcto del evento DealCreated (obtenido del contrato)
    const DEAL_CREATED_TOPIC = '0xc152a0dc026c12dcfd954ec08cab9995996295a0a000ff35cfac3af70ac6e516';


    const eventLog = receipt.logs.find(
      (log) =>
        log.address?.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() &&
        log.topics?.[0]?.toLowerCase() === DEAL_CREATED_TOPIC
    );

    let dealIdMessage = 'ID: no encontrado';
    try {
      if (eventLog && eventLog.topics[3]) {
        const idHex = eventLog.topics[3];
        const id = BigInt(idHex).toString();
        dealIdMessage = `ID del trato: ${id}`;
      }
    } catch (error) {
      console.warn('No se pudo extraer el dealId:', error);
    }

    alert(`Trato creado con éxito. ${dealIdMessage}`);
    setDealCost('');
  } catch (error) {
    console.error(error);
    alert('Error al crear trato');
  }
};


  const handlePayDeal = async () => {
  if (!isConnected || !payDealId.trim()) {
    alert('Conecta tu wallet y proporciona el ID del trato.');
    return;
  }

  try {
    const dealId = parseInt(payDealId);
    if (isNaN(dealId)) {
      alert('El ID del trato debe ser un número válido.');
      return;
    }

    // 1. Obtener los datos del trato
    const deal = await readContract(publicClient, {
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'getDeal',
      args: [dealId],
    });

    const { token, cost, commission } = deal as {
      token: `0x${string}`;
      cost: bigint;
      commission: bigint;
      creator: string;
      payer: string;
      paid: boolean;
      released: boolean;
    };

    const totalRequired = cost + commission / 2n;

    // 2. Verificar allowance
    const currentAllowance = await readContract(publicClient, {
      abi: erc20Abi,
      address: token,
      functionName: 'allowance',
      args: [address as `0x${string}`, CONTRACT_ADDRESS],
    });

    if ((currentAllowance as bigint) < totalRequired) {
      const hash = await writeContractAsync({
        abi: erc20Abi,
        address: token,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, totalRequired],
      });

      await waitForTransactionReceipt(publicClient, { hash })
    }

    // 3. Ejecutar pago
    await writeContractAsync({
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'payDeal',
      args: [dealId],
    });

    alert('Pago realizado exitosamente.');
    setPayDealId('');
  } catch (error) {
    console.error('Error al pagar el trato:', error);
    alert('Hubo un error al pagar el trato.');
  }
};


  const handleReleaseDeal = async () => {
    if (!isConnected || !releaseDealId.trim()) {
      alert('Conecta tu wallet y proporciona el ID del trato a liberar.');
      return;
    }

    try {
      const dealId = parseInt(releaseDealId);
      if (isNaN(dealId)) {
        alert('El ID del trato debe ser un número válido.');
        return;
      }

      await writeContractAsync({
        abi: CONTRACT_ABI,
        address: CONTRACT_ADDRESS,
        functionName: 'releaseDeal',
        args: [dealId],
      });

      alert('Pago liberado exitosamente.');
      setReleaseDealId('');
    } catch (error) {
      console.error('Error al liberar el trato:', error);
      alert('Hubo un error al liberar el trato.');
    }
  };

  const handleFetchCreatedDeals = async () => {
    if (!createdDealsWallet.trim()) {
      alert('Ingresa una wallet válida');
      return;
    }

    try {
      const dealIds = await readContract(publicClient, {
        abi: CONTRACT_ABI,
        address: CONTRACT_ADDRESS,
        functionName: 'getCreatedDeals',
        args: [createdDealsWallet as `0x${string}`],
      });

      console.log('IDs obtenidos:', dealIds);
      setCreatedDealIds(dealIds as bigint[]);
      setShowDeals(true);
    } catch (error) {
      console.error('Error al obtener IDs de tratos:', error);
      alert('No se pudieron cargar los tratos.');
    }
  };

  const handleFetchDealById = async () => {
  if (!dealDetailId.trim()) {
    alert('Ingresa un ID de trato válido');
    return;
  }

  try {
    const dealId = BigInt(dealDetailId);

    const deal = await readContract(publicClient, {
      abi: CONTRACT_ABI,
      address: CONTRACT_ADDRESS,
      functionName: 'getDeal',
      args: [dealId],
    });

    setDealDetails(deal);
  } catch (error) {
    console.error('Error al obtener detalles del trato:', error);
    alert('No se pudo obtener el trato.');
    setDealDetails(null);
  }
};


  return (
    <div className="min-h-screen bg-dark-primary text-white font-raleway relative overflow-hidden">
      {/* Sidebar */}
      <div className={`fixed top-0 left-0 h-full w-72 bg-medium-gray z-50 transform transition-transform duration-300 ease-in-out ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
    <div className="p-6 flex flex-col h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-xl font-semibold text-accent">Menú</h2>
        <button
          onClick={() => setSidebarOpen(false)}
          className="text-white hover:text-accent transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Buscar tratos creados */}
        <Input
          placeholder="Wallet del creador"
          value={createdDealsWallet}
          onChange={(e) => setCreatedDealsWallet(e.target.value)}
          className="mb-2 h-10 bg-transparent border-light-gray text-white"
        />
        <button
          onClick={handleFetchCreatedDeals}
          className="text-xl font-raleway font-semibold text-white hover:bg-accent hover:text-dark-primary transition-all duration-200 px-4 py-2 rounded-lg w-full text-left"
        >
          Tratos creados
        </button>

        {/* Mostrar los IDs justo debajo del botón */}
        {showDeals && createdDealIds.length > 0 && (
          <div className="text-white ml-2">
            <h4 className="text-lg font-semibold">IDs encontrados:</h4>
            <ul className="list-disc ml-4">
              {createdDealIds.map((id, idx) => (
                <li key={idx}>ID: {id.toString()}</li>
              ))}
            </ul>
          </div>
        )}

        <hr className="my-4 border-light-gray" />

        {/* Consultar detalle por ID */}
        <Input
          placeholder="ID del trato a consultar"
          value={dealDetailId}
          onChange={(e) => setDealDetailId(e.target.value)}
          className="mb-2 h-10 bg-transparent border-light-gray text-white"
        />
        <button
          onClick={handleFetchDealById}
          className="text-xl font-raleway font-semibold text-white hover:bg-accent hover:text-dark-primary transition-all duration-200 px-4 py-2 rounded-lg w-full text-left"
        >
          Consultar trato
        </button>

        {/* Mostrar detalles del trato */}
        {dealDetails && (
          <div className="text-white text-sm mt-2 space-y-1">
            <p><strong>Creador:</strong> {dealDetails.creator}</p>
            <p><strong>Pagador:</strong> {dealDetails.payer}</p>
            <p><strong>Token:</strong> {
              Object.entries(TOKEN_ADDRESSES).find(([symbol, address]) =>
                address.toLowerCase() === dealDetails.token.toLowerCase()
              )?.[0] || 'Desconocido'
            }</p>
            <p><strong>Costo:</strong> {(Number(dealDetails.cost) / 1_000_000).toFixed(6)}</p>
            <p><strong>Comisión:</strong> {(Number(dealDetails.commission) / 1_000_000).toFixed(6)}</p>
            <p><strong>Pagado:</strong> {dealDetails.paid ? 'Sí' : 'No'}</p>
            <p><strong>Liberado:</strong> {dealDetails.released ? 'Sí' : 'No'}</p>
          </div>
        )}
      </div>

      <div className="mt-auto">
        <div className="h-1 w-full bg-accent/30 mb-4"></div>
        <p className="text-sm text-light-gray">Abi.dil v1.0</p>
      </div>
    </div>
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        ></div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between p-6 relative z-10">
        <button
          onClick={() => setSidebarOpen(true)}
          className="h-6 w-6 text-accent hover:text-accent/80 transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-raleway font-normal text-accent">Abi.dil</h1>
        </div>
        
        <div className="flex items-center">
          <ConnectButton
            chainStatus="none"
            showBalance={false}
            accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
            label="Conectar Wallet"
          />
        </div>
      </header>
      

      <main className="px-6 pb-6 relative z-10">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-raleway font-normal leading-tight text-white">
            Confiar nunca fue tan fácil.
          </h2>
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <button
              onClick={handleCreateDeal}
              className="text-xl font-raleway font-semibold text-white hover:text-dark-primary hover:bg-accent transition-all duration-200 px-4 py-2 rounded-lg w-full text-left"
            >
              Crear trato
            </button>
            <Select value={selectedToken} onValueChange={setSelectedToken}>
              <SelectTrigger className="h-14 bg-transparent border-medium-gray rounded-xl text-white hover:border-light-gray transition-colors px-4">
                <div className="flex items-center gap-3 w-full">
                  {selectedToken === 'MXNB' ? (
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                  ) : (
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                  )}
                  <span className="font-raleway font-normal text-white">{selectedToken}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-dark-secondary border-medium-gray">
                <SelectItem value="MXNB" className="text-white font-raleway">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                    MXNB
                  </div>
                </SelectItem>
                <SelectItem value="USDC" className="text-white font-raleway">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full" />
                    USDC
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white font-raleway font-normal text-base">
                $
              </span>
              <Input
                placeholder="Costo del trato"
                value={dealCost}
                onChange={(e) => setDealCost(e.target.value)}
                className="h-14 bg-transparent border-medium-gray rounded-xl text-white placeholder:text-light-gray font-raleway font-normal hover:border-light-gray focus:border-accent transition-colors pl-8"
              />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3
            onClick={handlePayDeal}
            className="text-xl font-raleway font-semibold text-white cursor-pointer hover:text-accent transition-colors"
          >
            Pagar trato
          </h3>
          <Input
            placeholder="ID de trato"
            value={payDealId}
            onChange={(e) => setPayDealId(e.target.value)}
            className="h-14 bg-transparent border-medium-gray rounded-xl text-white placeholder:text-light-gray font-raleway font-normal hover:border-light-gray focus:border-accent transition-colors"
          />
        </div>

        <div className="space-y-4">
          <h3
            onClick={handleReleaseDeal}
            className="text-xl font-raleway font-semibold text-white hover:text-dark-primary hover:bg-accent transition-all duration-200 px-4 py-2 rounded-lg w-full text-left cursor-pointer"
          >
            Liberar trato
          </h3>
          <Input
            placeholder="ID de trato"
            value={releaseDealId}
            onChange={(e) => setReleaseDealId(e.target.value)}
            className="h-14 bg-transparent border-medium-gray rounded-xl text-white placeholder:text-light-gray font-raleway font-normal hover:border-light-gray focus:border-accent transition-colors"
          />
        </div>
        
      </main>
    </div>
  );
}
