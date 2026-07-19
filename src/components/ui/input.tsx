import * as React from 'react'
import { cn } from '@/lib/utils'
export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, ...props }, ref) => <input ref={ref} className={cn('flex h-12 w-full rounded-xl border-2 border-violet-200 bg-white px-4 text-base outline-none placeholder:text-slate-400 focus:border-violet-500 focus:ring-4 focus:ring-violet-100', className)} {...props} />)
Input.displayName = 'Input'
