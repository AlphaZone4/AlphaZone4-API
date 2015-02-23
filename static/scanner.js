jQuery(document).ready(function($){
    $("#hideboxes").click(function(){
        $(".hideme").hide();
    });
    $("#notloading").hide();
    
    // settings
    var config = {
        attempts: 15,
        attempt_delay: 5000
    };
    var error = "";
    
    // functions
    var status = function(s){
        $("#status").html(s);
    };
    
    var highlight_input = function(){
        $(this).select();
    };
    
    var add_item = function(){
        $("#codes").val($("#codes").val()+$(this).attr("name")+"\r\n");
    };
    
    // code
    status("Connecting to AlphaZone4...");
    var socket=io.connect('//scanner.alphazone4.com',{
        'reconnect': true,
        'reconnection delay': config.attempt_delay,
        'max reconnection attempts': config.attempts
    });
    // status messages
    socket.on('connect', function(){
        status("Connected!");
    });
    socket.on('disconnect', function(){
        if (error===""){
            status("Disconnected from AlphaZone4");
        }else{
            status(error);
        }
    });
    socket.on('item', function(data){
        console.log(data);
        var i = $("<li>");
        
        $("<img src='//cdn.alphazone4.com/i/"+data.im+".png' />").data("id", data.id).click(function() {
            item_load_box($(this).data("id"));
        }).appendTo(i);
        
        // work out country codes
        for(var ii=0; ii<data.cc.length; ii++) {
            i.append("<img src='//alphazone4.com/wp-content/plugins/itemdatabase/images/"+data.cc[ii].toLowerCase()+"sml.png' />")
        }
        $("<br /><img src='//wiki.alphazone4.com/icons/32x32/add.png' style='float:left' name='"+data.id+"' /> ").click(add_item).appendTo(i);
        $("<input style='font-size:10px;width:80px;margin-top:8px;' type='text' value='"+data.id+"'>").click(highlight_input).appendTo(i);
        $("#items_list").prepend(i);
    });
    socket.on('close', function(){
        error = "Already connected! Cannot have two connections active at once.";
        socket.disconnect();
    });
});