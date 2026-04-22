import { Button } from '@/components/ui/button';

interface AmountPresetButtonsProps {
  availableAmount: number;
  onSelect: (amount: string) => void;
  percentages?: number[];
  disabled?: boolean;
  decimals?: number;
}

export function AmountPresetButtons({
  availableAmount,
  onSelect,
  percentages = [25, 50, 75, 100],
  disabled = false,
  decimals = 6
}: AmountPresetButtonsProps) {
  const handlePresetClick = (percentage: number) => {
    if (availableAmount <= 0) return;
    
    const amount = (availableAmount * percentage) / 100;
    const formattedAmount = amount.toFixed(decimals);
    onSelect(formattedAmount);
  };

  const isDisabled = disabled || availableAmount <= 0;

  return (
    <div className="flex gap-2">
      {percentages.map((percentage) => (
        <Button
          key={percentage}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => handlePresetClick(percentage)}
          disabled={isDisabled}
          data-testid={`button-preset-${percentage}`}
          className="flex-1"
        >
          {percentage === 100 ? 'Max' : `${percentage}%`}
        </Button>
      ))}
    </div>
  );
}
