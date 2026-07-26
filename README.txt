# The Salty Baker v4

Clean GitHub Pages + Supabase rebuild.

## Upload files
Upload all files in this ZIP to the root of the GitHub repository.
Keep the existing `logo.png` in the repository root.

## Before using Orders
Run `setup_orders_table.sql` in Supabase SQL Editor.

## New flow
Paper sheet -> Order Capture -> Save Order -> Post to Finance -> Reports/Tax update automatically.

## Notes
Photo OCR is not automatic yet. This v4 package stores an order photo preview and supports a Quick Text parser plus review-before-save.
A true handwriting OCR step can be added later with a separate OCR service or Supabase Edge Function.
