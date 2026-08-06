<?php
/**
 * Банер «магазин переїхав» для СТАРОГО сайту maniagroup.com.ua (WordPress +
 * WooCommerce, LiteSpeed/PHP 7.4). Цей файл — НЕ частина нового сайту, він
 * лежить тут лише щоб не загубитись: старий хостинг нам не належить.
 *
 * Куди вставляти (будь-який із варіантів, згори — найбезпечніший):
 *   1. Плагін типу «Code Snippets» → новий сніпет → вставити код без рядка <?php.
 *   2. functions.php ДОЧІРНЬОЇ теми (у батьківській оновлення теми зітре).
 *   3. Окремий mu-plugin: wp-content/mu-plugins/maniagroup-banner.php (цілим файлом).
 *
 * Що робить: показує внизу смужку з посиланням на новий магазин. На картці
 * товару веде на ТОЙ САМИЙ товар (через артикул), на решті сторінок — на
 * головну нового сайту. Закривається хрестиком і не показується 14 днів.
 *
 * Старий сайт при цьому працює як працював — нічого не редиректиться.
 */

if (!defined('ABSPATH')) { exit; }

add_action('wp_footer', function () {
    if (is_admin()) { return; }

    $base = 'https://shop.maniagroup.com.ua';
    $utm  = 'utm_source=maniagroup.com.ua&utm_medium=banner&utm_campaign=migration';

    // На картці товару ведемо на той самий товар: артикул WooCommerce (SKU)
    // збігається з артикулом у новому каталозі, а /go/<артикул> перекидає на
    // потрібну сторінку. Якщо товару там уже немає — відкриється пошук по
    // цьому ж артикулу, а не порожня сторінка.
    $href  = $base . '/?' . $utm;
    $label = 'Перейти в новий магазин';

    if (function_exists('is_product') && is_product()) {
        $product = function_exists('wc_get_product') ? wc_get_product(get_the_ID()) : null;
        $sku = $product ? trim($product->get_sku()) : '';
        if ($sku !== '') {
            $href  = $base . '/go/' . rawurlencode($sku) . '?' . $utm;
            $label = 'Подивитись цей товар у новому магазині';
        }
    }

    $href = esc_url($href);
    ?>
    <div id="mg-move" hidden>
      <div class="mg-move__in">
        <div class="mg-move__txt">
          <strong>Ми переїхали на новий сайт</strong>
          <span>Той самий асортимент, зручніший каталог і оформлення замовлення онлайн.</span>
        </div>
        <a class="mg-move__cta" href="<?php echo $href; ?>"><?php echo esc_html($label); ?></a>
        <button class="mg-move__x" type="button" aria-label="Закрити">&times;</button>
      </div>
    </div>
    <style>
      #mg-move{position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#1a1714;color:#fbfaf8;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
        box-shadow:0 -18px 42px -30px rgba(0,0,0,.8)}
      #mg-move[hidden]{display:none}
      .mg-move__in{max-width:1200px;margin:0 auto;padding:14px 46px 14px 18px;display:flex;
        align-items:center;gap:18px;flex-wrap:wrap}
      .mg-move__txt{flex:1 1 260px;min-width:0;line-height:1.45}
      .mg-move__txt strong{display:block;font-size:15px;font-weight:600;letter-spacing:.02em}
      .mg-move__txt span{display:block;font-size:13px;opacity:.72;margin-top:2px}
      .mg-move__cta{flex:0 0 auto;display:inline-flex;align-items:center;min-height:44px;
        padding:0 22px;background:#fbfaf8;color:#1a1714;text-decoration:none;font-size:12px;
        font-weight:600;text-transform:uppercase;letter-spacing:.12em;transition:opacity .2s}
      .mg-move__cta:hover{opacity:.85;color:#1a1714}
      .mg-move__x{position:absolute;right:10px;top:10px;width:34px;height:34px;background:none;
        border:0;color:#fbfaf8;opacity:.55;font-size:24px;line-height:1;cursor:pointer}
      .mg-move__x:hover{opacity:1}
      #mg-move .mg-move__in{position:relative}
      @media(max-width:600px){
        .mg-move__in{padding:13px 42px 13px 15px;gap:11px}
        .mg-move__cta{width:100%;justify-content:center}
      }
    </style>
    <script>
    (function(){
      var KEY='mg_move_hidden', el=document.getElementById('mg-move');
      if(!el) return;
      var until=0;
      try{ until=parseInt(localStorage.getItem(KEY)||'0',10)||0; }catch(e){}
      if(until>Date.now()) return;         // закрили нещодавно — мовчимо
      el.hidden=false;
      // Смужка перекриває низ сторінки; на мобільних там часто «в кошик».
      document.body.style.paddingBottom=el.offsetHeight+'px';
      el.querySelector('.mg-move__x').addEventListener('click',function(){
        el.hidden=true;
        document.body.style.paddingBottom='';
        try{ localStorage.setItem(KEY,String(Date.now()+14*864e5)); }catch(e){}
      });
    })();
    </script>
    <?php
}, 100);
