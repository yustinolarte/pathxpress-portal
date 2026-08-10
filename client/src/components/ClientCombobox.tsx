import { useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

export interface ComboboxClient {
    id: number;
    companyName: string;
    contactName?: string | null;
    accountNumber?: string | null;
}

interface ClientComboboxProps {
    clients: ComboboxClient[] | undefined;
    value: string;
    onChange: (clientId: string) => void;
    disabled?: boolean;
    className?: string;
}

/**
 * Type-ahead client picker.
 *
 * The create-order dialog used a plain Select whose placeholder promised
 * "Search or Choose a client…" but offered no filtering, which is unusable once
 * an account list grows past a screenful.
 */
export default function ClientCombobox({
    clients,
    value,
    onChange,
    disabled,
    className,
}: ClientComboboxProps) {
    const [open, setOpen] = useState(false);
    const selected = clients?.find(c => c.id.toString() === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn(
                        'flex w-full h-12 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-base',
                        'focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed',
                        className,
                    )}
                >
                    <span className={cn('flex items-center gap-2 truncate', !selected && 'text-muted-foreground')}>
                        <Search className="h-4 w-4 shrink-0 text-primary" />
                        {selected ? selected.companyName : 'Search or choose a client...'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                    filter={(itemValue, search) =>
                        itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }
                >
                    <CommandInput placeholder="Type a company or contact name..." />
                    <CommandList>
                        <CommandEmpty>No client matches that search.</CommandEmpty>
                        <CommandGroup>
                            {clients?.map(client => (
                                <CommandItem
                                    key={client.id}
                                    // cmdk searches the value string, so fold in every
                                    // field an operator might type.
                                    value={[client.companyName, client.contactName, client.accountNumber]
                                        .filter(Boolean)
                                        .join(' ')}
                                    onSelect={() => {
                                        onChange(client.id.toString());
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            client.id.toString() === value ? 'opacity-100' : 'opacity-0',
                                        )}
                                    />
                                    <span className="flex-1 truncate">{client.companyName}</span>
                                    {client.contactName && (
                                        <span className="ml-2 text-xs text-muted-foreground truncate">
                                            {client.contactName}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
