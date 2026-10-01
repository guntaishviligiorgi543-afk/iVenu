ALTER TABLE public.orders
ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.orders
DROP CONSTRAINT orders_user_id_fkey;

ALTER TABLE public.orders
ADD CONSTRAINT orders_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.profiles(id)
ON DELETE SET NULL;;
