import { createContext, type PropsWithChildren, useContext, useState } from 'react';

type HouseEditingContextValue = {
  isEditing: boolean;
  setIsEditing: (isEditing: boolean) => void;
};

const HouseEditingContext = createContext<HouseEditingContextValue | null>(null);

export function HouseEditingProvider({ children }: PropsWithChildren) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <HouseEditingContext.Provider value={{ isEditing, setIsEditing }}>
      {children}
    </HouseEditingContext.Provider>
  );
}

export function useHouseEditing() {
  const context = useContext(HouseEditingContext);

  if (!context) {
    throw new Error('useHouseEditing must be used inside HouseEditingProvider.');
  }

  return context;
}
