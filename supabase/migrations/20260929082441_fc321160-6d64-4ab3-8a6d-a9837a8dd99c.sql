CREATE OR REPLACE FUNCTION public.propagate_load_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_leg            public.legs;
  v_target_leg     public.leg_status;
  v_all_legs_done  boolean;
  v_shipment_done  boolean;
  r_order          RECORD;
  v_all_ship_done  boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.leg_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_leg FROM public.legs WHERE id = NEW.leg_id;
  IF NOT FOUND OR v_leg.status = 'CANCELLED' THEN
    RETURN NEW;
  END IF;

  -- Map the physical load status onto the planning hierarchy.
  v_target_leg := CASE NEW.status
    WHEN 'Assigned'                  THEN 'ACTIVE'
    WHEN 'Heading To DC'             THEN 'ACTIVE'
    WHEN 'Loaded'                    THEN 'ACTIVE'
    WHEN 'En Route'                  THEN 'ACTIVE'
    WHEN 'Picked Up Return Trailer'  THEN 'ACTIVE'
    WHEN 'Returning'                 THEN 'ACTIVE'
    WHEN 'At Yard'                   THEN 'ACTIVE'
    WHEN 'Delayed'                   THEN 'ACTIVE'
    WHEN 'Delivered'                 THEN 'COMPLETED'
    WHEN 'Returned To DC'            THEN 'COMPLETED'
    WHEN 'Completed'                 THEN 'COMPLETED'
    ELSE NULL  -- 'Exception' never rolls the hierarchy back or forward
  END::public.leg_status;

  IF v_target_leg IS NULL THEN
    RETURN NEW;
  END IF;

  -- Never regress a completed leg back to active.
  IF NOT (v_leg.status = 'COMPLETED' AND v_target_leg = 'ACTIVE') THEN
    UPDATE public.legs SET status = v_target_leg, updated_at = now()
    WHERE id = v_leg.id AND status IS DISTINCT FROM v_target_leg;
  END IF;

  -- Stop completion: loading clears the pickup, delivering clears the delivery.
  IF NEW.status IN ('Loaded', 'En Route', 'Delivered', 'Returned To DC', 'Completed') THEN
    UPDATE public.stops SET status = 'COMPLETED'
    WHERE id = v_leg.origin_stop_id AND status IS DISTINCT FROM 'COMPLETED';
  END IF;
  IF NEW.status IN ('Delivered', 'Returned To DC', 'Completed') THEN
    UPDATE public.stops SET status = 'COMPLETED'
    WHERE id = v_leg.destination_stop_id AND status IS DISTINCT FROM 'COMPLETED';
  END IF;

  -- Shipment roll-up.
  SELECT bool_and(l.status IN ('COMPLETED', 'CANCELLED'))
    INTO v_all_legs_done
  FROM public.legs l
  WHERE l.shipment_id = v_leg.shipment_id;

  v_shipment_done := COALESCE(v_all_legs_done, false);

  UPDATE public.shipments
     SET status = CASE WHEN v_shipment_done THEN 'COMPLETED' ELSE 'IN_PROGRESS' END::public.shipment_status,
         updated_at = now()
   WHERE id = v_leg.shipment_id
     AND status <> 'CANCELLED'
     AND status IS DISTINCT FROM (CASE WHEN v_shipment_done THEN 'COMPLETED' ELSE 'IN_PROGRESS' END)::public.shipment_status;

  -- Order roll-up: every order carried by this shipment.
  FOR r_order IN
    SELECT so.order_id
    FROM public.shipment_orders so
    WHERE so.shipment_id = v_leg.shipment_id
  LOOP
    SELECT bool_and(s.status IN ('COMPLETED', 'CANCELLED'))
      INTO v_all_ship_done
    FROM public.shipment_orders so2
    JOIN public.shipments s ON s.id = so2.shipment_id
    WHERE so2.order_id = r_order.order_id;

    UPDATE public.orders
       SET status = CASE WHEN COALESCE(v_all_ship_done, false) THEN 'CLOSED' ELSE 'ALLOCATED' END::public.order_status,
           updated_at = now()
     WHERE id = r_order.order_id
       AND status <> 'CANCELLED'
       AND status IS DISTINCT FROM (CASE WHEN COALESCE(v_all_ship_done, false) THEN 'CLOSED' ELSE 'ALLOCATED' END)::public.order_status;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.propagate_load_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propagate_load_status() TO service_role;

DROP TRIGGER IF EXISTS trailer_loads_propagate_status ON public.trailer_loads;
CREATE TRIGGER trailer_loads_propagate_status
AFTER UPDATE OF status ON public.trailer_loads
FOR EACH ROW EXECUTE FUNCTION public.propagate_load_status();