import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition active:translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300', {
  variants: { variant: { default: 'bg-violet-600 text-white shadow-pop hover:bg-violet-700', secondary: 'bg-amber-300 text-amber-950 shadow-pop hover:bg-amber-400', outline: 'border-2 border-violet-200 bg-white hover:bg-violet-50', ghost: 'hover:bg-violet-100' }, size: { default: 'h-11 px-5', sm: 'h-9 px-3', lg: 'h-14 px-8 text-base', icon: 'size-11' } },
  defaultVariants: { variant: 'default', size: 'default' },
})
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})
Button.displayName = 'Button'
