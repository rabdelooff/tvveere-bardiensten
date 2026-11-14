-- De oude overzichtsview omzeilde de rechten en wordt door de app niet gebruikt.
alter view if exists public.v_diensten set schema archief;
revoke execute on function public.rls_auto_enable() from authenticated, anon, public;
